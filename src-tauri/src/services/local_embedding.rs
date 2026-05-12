use std::sync::Mutex;
use tokenizers::Tokenizer;

enum EmbeddingBackend {
    Onnx(ort::session::Session),
    Candle {
        model: candle_transformers::models::bert::BertModel,
        device: candle_core::Device,
    },
}

pub struct LocalEmbeddingModel {
    backend: EmbeddingBackend,
    tokenizer: Tokenizer,
}

impl LocalEmbeddingModel {
    pub fn load() -> Result<Self, String> {
        let data_dir = dirs::data_local_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("hermes-desktop")
            .join("models")
            .join("all-MiniLM-L6-v2");

        let onnx_path = data_dir.join("model.onnx");
        let safetensors_path = data_dir.join("model.safetensors");
        let config_path = data_dir.join("config.json");
        let tokenizer_path = data_dir.join("tokenizer.json");

        if !tokenizer_path.exists() {
            return Err(format!("tokenizer文件不存在: {}", tokenizer_path.display()));
        }

        let mut tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| format!("加载tokenizer失败: {}", e))?;

        if let Some(pp) = tokenizer.get_padding_mut() {
            pp.strategy = tokenizers::PaddingStrategy::BatchLongest;
        } else {
            let pp = tokenizers::PaddingParams {
                strategy: tokenizers::PaddingStrategy::BatchLongest,
                ..Default::default()
            };
            tokenizer.with_padding(Some(pp));
        }

        let trunc = tokenizers::TruncationParams {
            max_length: 512,
            strategy: tokenizers::TruncationStrategy::LongestFirst,
            ..Default::default()
        };
        let _ = tokenizer.with_truncation(Some(trunc));

        if onnx_path.exists() {
            log::info!("[local_embedding] 使用 ONNX Runtime 后端");
            let session = ort::session::Session::builder()
                .map_err(|e| format!("创建ONNX会话构建器失败: {}", e))?
                .commit_from_file(&onnx_path)
                .map_err(|e| format!("加载ONNX模型失败: {}", e))?;
            Ok(LocalEmbeddingModel {
                backend: EmbeddingBackend::Onnx(session),
                tokenizer,
            })
        } else if safetensors_path.exists() && config_path.exists() {
            log::info!("[local_embedding] ONNX模型不存在，使用 candle CPU 后端");
            let device = candle_core::Device::Cpu;

            let config_str = std::fs::read_to_string(&config_path)
                .map_err(|e| format!("读取config.json失败: {}", e))?;
            let config: candle_transformers::models::bert::Config =
                serde_json::from_str(&config_str)
                    .map_err(|e| format!("解析config.json失败: {}", e))?;

            let weights = candle_core::safetensors::load(&safetensors_path, &device)
                .map_err(|e| format!("加载safetensors权重失败: {}", e))?;
            let vb = candle_nn::VarBuilder::from_tensors(
                weights,
                candle_core::DType::F32,
                &device,
            );

            let model = candle_transformers::models::bert::BertModel::load(vb, &config)
                .map_err(|e| format!("加载BERT模型失败: {}", e))?;

            Ok(LocalEmbeddingModel {
                backend: EmbeddingBackend::Candle { model, device },
                tokenizer,
            })
        } else {
            Err("模型文件不存在，请先下载模型".to_string())
        }
    }

    pub fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        log::info!("[local_embedding] embed start, batch_size={}", texts.len());

        let mut all_token_ids = Vec::with_capacity(texts.len());
        let mut all_attention_masks = Vec::with_capacity(texts.len());
        let mut max_len = 0;
        for text in texts {
            let encoding = self
                .tokenizer
                .encode(text.as_str(), true)
                .map_err(|e| format!("tokenization失败: {}", e))?;
            let ids = encoding.get_ids().to_vec();
            let attention_mask = encoding.get_attention_mask().to_vec();
            max_len = max_len.max(ids.len());
            all_token_ids.push(ids);
            all_attention_masks.push(attention_mask);
        }

        for (ids, mask) in all_token_ids.iter_mut().zip(all_attention_masks.iter_mut()) {
            ids.resize(max_len, 0);
            mask.resize(max_len, 0);
        }

        log::info!(
            "[local_embedding] tokenization done, {} sequences, max_len={}",
            all_token_ids.len(),
            max_len
        );

        match &mut self.backend {
            EmbeddingBackend::Onnx(ref mut session) => {
                Self::embed_onnx(session, &all_token_ids, &all_attention_masks, max_len)
            }
            EmbeddingBackend::Candle { model, device } => {
                Self::embed_candle(model, device, &all_token_ids, max_len)
            }
        }
    }

    fn embed_onnx(
        session: &mut ort::session::Session,
        all_token_ids: &[Vec<u32>],
        all_attention_masks: &[Vec<u32>],
        max_len: usize,
    ) -> Result<Vec<Vec<f32>>, String> {
        let batch_size = all_token_ids.len();

        let flat_ids: Vec<i64> = all_token_ids
            .iter()
            .flat_map(|v| v.iter().map(|&x| x as i64))
            .collect();
        let flat_mask: Vec<i64> = all_attention_masks
            .iter()
            .flat_map(|v| v.iter().map(|&x| x as i64))
            .collect();
        let flat_type_ids: Vec<i64> = vec![0i64; batch_size * max_len];

        let input_ids = ndarray::Array2::from_shape_vec((batch_size, max_len), flat_ids)
            .map_err(|e| format!("创建input_ids数组失败: {}", e))?;
        let attention_mask = ndarray::Array2::from_shape_vec((batch_size, max_len), flat_mask)
            .map_err(|e| format!("创建attention_mask数组失败: {}", e))?;
        let token_type_ids = ndarray::Array2::from_shape_vec((batch_size, max_len), flat_type_ids)
            .map_err(|e| format!("创建token_type_ids数组失败: {}", e))?;

        log::info!(
            "[local_embedding] ONNX arrays ready, shape={:?}, starting inference",
            input_ids.shape()
        );

        let outputs = session
            .run(ort::inputs![
                ort::value::TensorRef::from_array_view(input_ids.view())
                    .map_err(|e| format!("创建input_ids tensor失败: {}", e))?,
                ort::value::TensorRef::from_array_view(attention_mask.view())
                    .map_err(|e| format!("创建attention_mask tensor失败: {}", e))?,
                ort::value::TensorRef::from_array_view(token_type_ids.view())
                    .map_err(|e| format!("创建token_type_ids tensor失败: {}", e))?,
            ])
            .map_err(|e| format!("ONNX推理失败: {}", e))?;

        log::info!("[local_embedding] ONNX inference done");

        let last_hidden_state = outputs
            .get("last_hidden_state")
            .ok_or_else(|| "ONNX输出中找不到 last_hidden_state".to_string())?;

        let (shape, flat) = last_hidden_state
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("提取tensor失败: {}", e))?;

        let n_tokens = shape[1] as usize;
        let hidden_size = shape[2] as usize;

        Self::mean_pool_and_normalize(flat, batch_size, n_tokens, hidden_size)
    }

    fn embed_candle(
        model: &candle_transformers::models::bert::BertModel,
        device: &candle_core::Device,
        all_token_ids: &[Vec<u32>],
        max_len: usize,
    ) -> Result<Vec<Vec<f32>>, String> {
        let batch_size = all_token_ids.len();

        let flat_ids: Vec<u32> = all_token_ids.iter().flat_map(|v| v.iter().copied()).collect();

        let token_ids = candle_core::Tensor::new(flat_ids, device)
            .map_err(|e| format!("创建token_ids张量失败: {}", e))?
            .reshape(&[batch_size, max_len])
            .map_err(|e| format!("reshape token_ids失败: {}", e))?;
        let token_type_ids = token_ids
            .zeros_like()
            .map_err(|e| format!("创建token_type_ids失败: {}", e))?;

        log::info!(
            "[local_embedding] candle tensors ready, shape={:?}, starting forward pass",
            token_ids.shape()
        );

        let embeddings = model
            .forward(&token_ids, &token_type_ids, None)
            .map_err(|e| format!("BERT前向推理失败: {}", e))?;

        log::info!("[local_embedding] candle forward pass done");

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

        embeddings
            .to_vec2::<f32>()
            .map_err(|e| format!("转换embedding向量失败: {}", e))
    }

    fn mean_pool_and_normalize(
        flat: &[f32],
        batch_size: usize,
        n_tokens: usize,
        hidden_size: usize,
    ) -> Result<Vec<Vec<f32>>, String> {
        let mut embeddings = Vec::with_capacity(batch_size);
        for i in 0..batch_size {
            let start = i * n_tokens * hidden_size;
            let end = start + n_tokens * hidden_size;
            let token_embeds = &flat[start..end];

            let mut pooled = vec![0.0f32; hidden_size];
            for t in 0..n_tokens {
                for h in 0..hidden_size {
                    pooled[h] += token_embeds[t * hidden_size + h];
                }
            }
            let n = n_tokens as f32;
            for h in 0..hidden_size {
                pooled[h] /= n;
            }

            let norm: f32 = pooled.iter().map(|x| x * x).sum::<f32>().sqrt();
            if norm > 0.0 {
                for h in 0..hidden_size {
                    pooled[h] /= norm;
                }
            }

            embeddings.push(pooled);
        }
        Ok(embeddings)
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

    pub fn get_or_load(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, Option<LocalEmbeddingModel>>, String> {
        let mut guard = self
            .model
            .lock()
            .map_err(|e| format!("获取模型锁失败: {}", e))?;
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

pub fn embed_text_local(
    state: &LocalEmbeddingState,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = state.get_or_load()?;
    if let Some(ref mut model) = *guard {
        model.embed(texts)
    } else {
        Err("本地嵌入模型未加载".to_string())
    }
}

pub fn embed_text_local_single(
    state: &LocalEmbeddingState,
    text: &str,
) -> Result<Vec<f32>, String> {
    let mut guard = state.get_or_load()?;
    if let Some(ref mut model) = *guard {
        model.embed_single(text)
    } else {
        Err("本地嵌入模型未加载".to_string())
    }
}