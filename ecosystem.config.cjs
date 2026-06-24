module.exports = {
  apps: [
    {
      name: "memory-coder",
      script: "D:\\laragon\\www\\MCPCODING\\memory-coder\\dist\\index.js",
      cwd: "D:\\laragon\\www\\MCPCODING",
      env: {
        MEMORY_CODER_MODE: "bridge",
        MEMORY_CODER_PORT: "3333",
        INDEXER_INTERVAL_MIN: "360",
        EMBEDDING_MODEL: "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
      },
      autorestart: true,
      max_restarts: 10,
      watch: false
    },
    {
      name: "memory-coder-scheduler",
      script: "D:\\laragon\\www\\MCPCODING\\memory-coder\\scripts\\scheduler.cjs",
      cwd: "D:\\laragon\\www\\MCPCODING",
      env: {
        SCHED_EVAL_HOUR: "3",
        SCHED_CONSOLIDATE_WEEKDAY: "0",
        SCHED_CONSOLIDATE_HOUR: "4",
        SCHED_CONSOLIDATE_APPLY: "false"
      },
      autorestart: true,
      max_restarts: 10,
      watch: false
    }
  ]
};
