# Local runtime data / 本地运行数据

This directory is created and used by the optional Windows database mode.
`database.json`, its backups, and `server.url` are intentionally excluded from Git
because they may contain health records, accounts, and machine-specific state.
The application seeds demonstration data on first run; no database file needs to be committed.

此目录供可选的 Windows 数据库模式使用。数据库、备份与本机服务地址均不上传至 GitHub；
首次运行时，应用会自动生成演示数据，无需提交数据库文件。
