import { useState, useEffect, useCallback, useRef } from "react";
import { TauriCommands } from "@services/tauri/TauriCommands";
import type { CronJob, CronJobOutput } from "@core/tauri/types";
import type { SkillItem } from "@core/types";

interface CronSettingsProps {
  t: (key: string) => string;
}

function CronJobModal({
  t,
  job,
  onClose,
  onSave,
}: {
  t: (key: string) => string;
  job: CronJob | null;
  onClose: () => void;
  onSave: (data: { name: string; prompt: string; schedule: string; skills: string[] }) => void;
}) {
  const isEdit = !!job;
  const [name, setName] = useState(job?.name || "");
  const [prompt, setPrompt] = useState(job?.prompt || "");
  const [schedule, setSchedule] = useState(job?.schedule || "");
  const [skills, setSkills] = useState<string[]>(job?.skills || []);
  const [skillInput, setSkillInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installedSkills, setInstalledSkills] = useState<SkillItem[]>([]);
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [skillDropdownAbove, setSkillDropdownAbove] = useState(false);
  const skillDropdownRef = useRef<HTMLDivElement>(null);
  const skillInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    TauriCommands.listSkills()
      .then((result) => {
        setInstalledSkills(result.skills.filter((s) => s.enabled));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (skillDropdownRef.current && !skillDropdownRef.current.contains(e.target as Node)) {
        setShowSkillDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSkills = installedSkills.filter(
    (s) =>
      !skills.includes(s.name) &&
      (s.name.toLowerCase().includes(skillInput.toLowerCase()) ||
        s.category.toLowerCase().includes(skillInput.toLowerCase()))
  );

  const handleSelectSkill = (skillName: string) => {
    if (!skills.includes(skillName)) {
      setSkills([...skills, skillName]);
    }
    setSkillInput("");
    setShowSkillDropdown(false);
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const openSkillDropdown = () => {
    if (skillInputRef.current) {
      const rect = skillInputRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      setSkillDropdownAbove(spaceBelow < 200);
    }
    setShowSkillDropdown(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(`${t("cron.name")} ${t("cron.required")}`);
      return;
    }
    if (!prompt.trim()) {
      setError(`${t("cron.prompt")} ${t("cron.required")}`);
      return;
    }
    if (!schedule.trim()) {
      setError(`${t("cron.schedule")} ${t("cron.required")}`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      onSave({ name: name.trim(), prompt: prompt.trim(), schedule: schedule.trim(), skills });
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const quickSchedules = [
    { label: t("cron.everyMinute"), value: "* * * * *" },
    { label: t("cron.every5Minutes"), value: "*/5 * * * *" },
    { label: t("cron.everyHour"), value: "0 * * * *" },
    { label: t("cron.everyDay"), value: "0 0 * * *" },
    { label: t("cron.everyWeek"), value: "0 0 * * 0" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border shadow-xl w-[520px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-10 px-3 border-b border-border">
          <h3 className="text-base font-semibold text-foreground m-0">
            {isEdit ? t("cron.edit") : t("cron.add")}
          </h3>
          <button
            className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="text-[12px] text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">
              {t("cron.name")}
            </label>
            <input
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("cron.namePlaceholder")}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">
              {t("cron.prompt")}
            </label>
            <textarea
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary resize-y min-h-[80px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("cron.promptPlaceholder")}
              rows={4}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">
              {t("cron.schedule")}
            </label>
            <input
              className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary font-mono"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 * * * *"
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {quickSchedules.map((qs) => (
                <button
                  key={qs.value}
                  className={`px-2 py-0.5 border-0 rounded text-[10px] cursor-pointer transition-colors ${
                    schedule === qs.value
                      ? "bg-primary/15 text-primary font-medium"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setSchedule(qs.value)}
                >
                  {qs.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1 block">
              {t("cron.skills")}
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1"
                >
                  {skill}
                  <button
                    className="bg-transparent border-0 text-primary cursor-pointer text-[10px] p-0"
                    onClick={() => handleRemoveSkill(skill)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="relative" ref={skillDropdownRef}>
              <input
                ref={skillInputRef}
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-[13px] text-foreground outline-none focus:border-primary"
                value={skillInput}
                onChange={(e) => {
                  setSkillInput(e.target.value);
                  openSkillDropdown();
                }}
                onFocus={() => openSkillDropdown()}
                placeholder={t("cron.skillsSearchPlaceholder")}
              />
              {showSkillDropdown && filteredSkills.length > 0 && (
                <div
                  className={`absolute left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[180px] overflow-y-auto ${skillDropdownAbove ? "bottom-full mb-1" : "top-full"}`}
                >
                  {filteredSkills.map((skill) => (
                    <button
                      key={skill.name}
                      className="w-full px-3 py-2 bg-transparent border-0 text-left cursor-pointer hover:bg-muted/60 flex items-center gap-2 text-[13px] text-foreground"
                      onClick={() => handleSelectSkill(skill.name)}
                    >
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        {skill.category}
                      </span>
                      <span className="truncate">{skill.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {showSkillDropdown &&
                skillInput &&
                filteredSkills.length === 0 &&
                installedSkills.length > 0 && (
                  <div
                    className={`absolute left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 p-3 text-[12px] text-muted-foreground text-center ${skillDropdownAbove ? "bottom-full mb-1" : "top-full"}`}
                  >
                    {t("cron.noSkillMatch")}
                  </div>
                )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="px-4 py-2 bg-transparent border border-border rounded-lg text-[13px] cursor-pointer text-muted-foreground hover:bg-muted transition-colors"
              onClick={onClose}
            >
              {t("cron.cancel")}
            </button>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground border-0 rounded-lg text-[13px] cursor-pointer hover:bg-primary/90 transition-colors disabled:opacity-50"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? t("cron.saving") : t("cron.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CronOutputModal({
  t,
  job,
  onClose,
}: {
  t: (key: string) => string;
  job: CronJob;
  onClose: () => void;
}) {
  const [outputs, setOutputs] = useState<CronJobOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    TauriCommands.cronGetOutputs(job.id)
      .then(setOutputs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [job.id]);

  const formatTime = (raw: string) => {
    try {
      const replaced = raw.replace(/_/g, " ").replace(/-/g, "-");
      const parts = replaced.split(" ");
      if (parts.length >= 2) {
        const datePart = parts.slice(0, 3).join("-");
        const timePart = parts.slice(3).join(":");
        return `${datePart} ${timePart}`;
      }
    } catch {}
    return raw;
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border border-border shadow-xl w-[720px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-10 px-3 border-b border-border">
          <h3 className="text-base font-semibold text-foreground m-0">
            {t("cron.outputs")} — {job.name}
          </h3>
          <button
            className="border-none bg-transparent text-lg cursor-pointer text-muted-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-3">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t("cron.loading")}
            </div>
          ) : outputs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t("cron.noOutputs")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">
                  {t("cron.outputCount").replace("{n}", String(outputs.length))}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border/50">
                  <span className="w-[170px] shrink-0">{t("cron.outputTime")}</span>
                  <span className="w-[60px] shrink-0">{t("cron.outputStatus")}</span>
                  <span className="flex-1">{t("cron.outputContent")}</span>
                </div>

                {outputs.map((output) => {
                  const isExpanded = expandedId === output.id;
                  const outputPreview = output.output
                    .replace(/^#.*$/gm, "")
                    .replace(/\n{2,}/g, "\n")
                    .trim()
                    .slice(0, 80);

                  return (
                    <div key={output.id}>
                      <div
                        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => toggleExpand(output.id)}
                      >
                        <span className="w-[170px] shrink-0 text-[12px] text-foreground font-mono">
                          {formatTime(output.started_at || output.id)}
                        </span>
                        <span className="w-[60px] shrink-0">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              output.status === "completed"
                                ? "bg-green-500/10 text-green-600"
                                : output.status === "error"
                                  ? "bg-red-500/10 text-red-500"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {output.status === "completed"
                              ? "OK"
                              : output.status === "error"
                                ? t("cron.stateError")
                                : output.status}
                          </span>
                        </span>
                        <span className="flex-1 text-[12px] text-muted-foreground truncate">
                          {outputPreview || t("cron.outputContent")}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {isExpanded ? "▾" : "▸"}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="mx-3 mb-2 rounded-md border border-border bg-muted/20 p-3">
                          <pre className="text-[11px] text-foreground whitespace-pre-wrap break-all m-0 max-h-[250px] overflow-y-auto">
                            {output.output}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CronSettings({ t }: CronSettingsProps) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [outputJob, setOutputJob] = useState<CronJob | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const list = await TauriCommands.cronListJobs();
      setJobs(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleAdd = () => {
    setEditingJob(null);
    setShowModal(true);
  };

  const handleEdit = (job: CronJob) => {
    setEditingJob(job);
    setShowModal(true);
  };

  const handleSave = async (data: {
    name: string;
    prompt: string;
    schedule: string;
    skills: string[];
  }) => {
    try {
      if (editingJob) {
        await TauriCommands.cronUpdateJob(
          editingJob.id,
          data.name,
          data.prompt,
          data.schedule,
          data.skills
        );
      } else {
        await TauriCommands.cronCreateJob(data.name, data.prompt, data.schedule, data.skills);
      }
      setShowModal(false);
      setEditingJob(null);
      loadJobs();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("cron.confirmDelete"))) return;
    try {
      await TauriCommands.cronDeleteJob(id);
      loadJobs();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      const updatedJob = await TauriCommands.cronTriggerJob(id);
      setJobs((prev) => prev.map((j) => (j.id === id ? updatedJob : j)));
      const triggeredJob = jobs.find((j) => j.id === id);
      if (triggeredJob) {
        setOutputJob(updatedJob);
      }
    } catch (e) {
      alert(String(e));
    }
  };

  const handlePause = async (id: string) => {
    try {
      await TauriCommands.cronPauseJob(id);
      loadJobs();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleResume = async (id: string) => {
    try {
      await TauriCommands.cronResumeJob(id);
      loadJobs();
    } catch (e) {
      alert(String(e));
    }
  };

  const stateLabel = (state: string) => {
    const map: Record<string, string> = {
      scheduled: t("cron.stateScheduled"),
      paused: t("cron.statePaused"),
      running: t("cron.stateRunning"),
      completed: t("cron.stateCompleted"),
      error: t("cron.stateError"),
    };
    return map[state] || state;
  };

  const stateColor = (state: string) => {
    const map: Record<string, string> = {
      scheduled: "bg-blue-500/10 text-blue-600",
      paused: "bg-yellow-500/10 text-yellow-600",
      running: "bg-green-500/10 text-green-600",
      completed: "bg-muted text-muted-foreground",
      error: "bg-red-500/10 text-red-500",
    };
    return map[state] || "bg-muted text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        {t("cron.loading")}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-foreground m-0">{t("cron.title")}</h2>
        <button
          className="px-3 py-1.5 bg-primary text-primary-foreground border-0 rounded-lg text-[12px] cursor-pointer hover:bg-primary/90 transition-colors"
          onClick={handleAdd}
        >
          + {t("cron.add")}
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">{t("cron.empty")}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{job.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${stateColor(job.state)}`}>
                    {stateLabel(job.state)}
                  </span>
                  {!job.enabled && job.state !== "paused" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">
                      {t("cron.disabled")}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  <span className="font-mono">{job.schedule_display}</span>
                  {job.skills.length > 0 && (
                    <span className="ml-2">
                      {t("cron.skillsLabel")}: {job.skills.join(", ")}
                    </span>
                  )}
                </div>
                {job.next_run && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {t("cron.nextRun")}: {job.next_run}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="px-2 py-1 bg-blue-500/10 text-blue-600 border-0 rounded text-[11px] cursor-pointer hover:bg-blue-500/20 transition-colors"
                  onClick={() => handleTrigger(job.id)}
                >
                  {t("cron.trigger")}
                </button>
                {!job.enabled || job.state === "paused" ? (
                  <button
                    className="px-2 py-1 bg-green-500/10 text-green-600 border-0 rounded text-[11px] cursor-pointer hover:bg-green-500/20 transition-colors"
                    onClick={() => handleResume(job.id)}
                  >
                    {t("cron.resume")}
                  </button>
                ) : (
                  <button
                    className="px-2 py-1 bg-yellow-500/10 text-yellow-600 border-0 rounded text-[11px] cursor-pointer hover:bg-yellow-500/20 transition-colors"
                    onClick={() => handlePause(job.id)}
                  >
                    {t("cron.pause")}
                  </button>
                )}
                <button
                  className="px-2 py-1 bg-muted text-muted-foreground border-0 rounded text-[11px] cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => handleEdit(job)}
                >
                  {t("cron.edit")}
                </button>
                <button
                  className="px-2 py-1 bg-purple-500/10 text-purple-600 border-0 rounded text-[11px] cursor-pointer hover:bg-purple-500/20 transition-colors"
                  onClick={() => setOutputJob(job)}
                >
                  {t("cron.outputs")}
                </button>
                <button
                  className="px-2 py-1 bg-red-500/10 text-red-500 border-0 rounded text-[11px] cursor-pointer hover:bg-red-500/20 transition-colors"
                  onClick={() => handleDelete(job.id)}
                >
                  {t("cron.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CronJobModal
          t={t}
          job={editingJob}
          onClose={() => {
            setShowModal(false);
            setEditingJob(null);
          }}
          onSave={handleSave}
        />
      )}

      {outputJob && <CronOutputModal t={t} job={outputJob} onClose={() => setOutputJob(null)} />}
    </div>
  );
}
