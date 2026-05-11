use candle_core::{Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config};
use std::sync::Mutex;
use tokenizers::Tokenizer;

pub struct LocalEmbeddingModel {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
}

impl LocalEmbeddingModel {
    pub fn load() -> Result<Self, String> {
        let data_dir = dirs::data_local_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("hermes-desktop")
            .join("models")
            .join("all-MiniLM-L6-v2");

        let model_path = data_dir.join("model.safetensors");
        let config_path = data_dir.join("config.json");
        let tokenizer_path = data_dir.join("tokenizer.json");

        if !model_path.exists() || !config_path.exists() || !tokenizer_path.exists() {
            return Err("本地嵌入模型文件不存在，请先下载模型".to_string());
        }

        let device = Device::Cpu;

        let config_str = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("读取config.json失败: {}", e))?;
        let config: Config = serde_json::from_str(&config_str)
            .map_err(|e| format!("解析config.json失败: {}", e))?;

        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| format!("加载tokenizer失败: {}", e))?;

        let weights = candle_core::safetensors::load(&model_path, &device)
            .map_err(|e| format!("加载safetensors权重失败: {}", e))?;
        let vb = VarBuilder::from_tensors(weights, candle_core::DType::F32, &device);

        let model = BertModel::load(vb, &config)
            .map_err(|e| format!("加载BERT模型失败: {}", e))?;

        Ok(LocalEmbeddingModel {
            model,
            tokenizer,
            device,
        })
    }

    pub fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let mut tokenizer = self.tokenizer.clone();

        if let Some(pp) = tokenizer.get_padding_mut() {
            pp.strategy = tokenizers::PaddingStrategy::BatchLongest;
        } else {
            let pp = tokenizers::PaddingParams {
                strategy: tokenizers::PaddingStrategy::BatchLongest,
                ..Default::default()
            };
            tokenizer.with_padding(Some(pp));
        }

        let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
        let tokens = tokenizer
            .encode_batch(text_refs, true)
            .map_err(|e| format!("tokenization失败: {}", e))?;

        let token_ids = tokens
            .iter()
            .map(|token| {
                let ids = token.get_ids().to_vec();
                Tensor::new(ids.as_slice(), &self.device)
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("创建token_ids张量失败: {}", e))?;

        let token_ids = Tensor::stack(&token_ids, 0)
            .map_err(|e| format!("stack token_ids失败: {}", e))?;
        let token_type_ids = token_ids
            .zeros_like()
            .map_err(|e| format!("创建token_type_ids失败: {}", e))?;

        let embeddings = self
            .model
            .forward(&token_ids, &token_type_ids, None)
            .map_err(|e| format!("BERT前向推理失败: {}", e))?;

        let (_n_sentences, n_tokens, _hidden_size) = embeddings
            .dims3()
            .map_err(|e| format!("获取embedding维度失败: {}", e))?;

        let embeddings = (embeddings.sum(1).map_err(|e| e.to_string())?
            / (n_tokens as f64))
            .map_err(|e| format!("mean pooling失败: {}", e))?;

        let norm = embeddings
            .sqr()
            .map_err(|e| e.to_string())?
            .sum_keepdim(1)
            .map_err(|e| e.to_string())?
            .sqrt()
            .map_err(|e| e.to_string())?;
        let embeddings = embeddings
            .broadcast_div(&norm)
            .map_err(|e| format!("L2归一化失败: {}", e))?;

        let result = embeddings
            .to_vec2::<f32>()
            .map_err(|e| format!("转换embedding向量失败: {}", e))?;

        Ok(result)
    }

    pub fn embed_single(&mut self, text: &str) -> Result<Vec<f32>, String> {
        let results = self.embed(&[text.to_string()])?;
        results
            .into_iter()
            .next()
            .ok_or_else(|| "未能生成嵌入向量".to_string())
    }
}

pub struct LocalEmbeddingState {
    pub model: Mutex<Option<LocalEmbeddingModel>>,
}

impl LocalEmbeddingState {
    pub fn new() -> Self {
        LocalEmbeddingState {
            model: Mutex::new(None),
        }
    }

    pub fn get_or_load(&self) -> Result<std::sync::MutexGuard<'_, Option<LocalEmbeddingModel>>, String> {
        let mut guard = self.model.lock().map_err(|e| format!("获取模型锁失败: {}", e))?;
        if guard.is_none() {
            match LocalEmbeddingModel::load() {
                Ok(model) => {
                    log::info!("[local_embedding] 模型加载成功");
                    *guard = Some(model);
                }
                Err(e) => {
                    log::warn!("[local_embedding] 模型加载失败: {}", e);
                    return Err(e);
                }
            }
        }
        Ok(guard)
    }
}

pub fn embed_text_local(state: &LocalEmbeddingState, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = state.get_or_load()?;
    if let Some(ref mut model) = *guard {
        model.embed(texts)
    } else {
        Err("本地嵌入模型未加载".to_string())
    }
}

pub fn embed_text_local_single(state: &LocalEmbeddingState, text: &str) -> Result<Vec<f32>, String> {
    let mut guard = state.get_or_load()?;
    if let Some(ref mut model) = *guard {
        model.embed_single(text)
    } else {
        Err("本地嵌入模型未加载".to_string())
    }
}
