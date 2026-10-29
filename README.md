这是复刻 AlecaFrame 的非官方中文版。


从 0.1.6 起，已安装客户端使用签名文件清单检查更新，只下载哈希发生变化的文件数据；OCR、ONNX Runtime 等未变化依赖会跳过。文件替换前备份，启动未确认或更新中断时可回滚。首次安装仍使用完整安装包；0.1.5 及更早版本需要一次完整包迁移。

构建仍运行 tools/build-update.ps1。产物除完整安装包外还包括 incremental.json、incremental.json.sig 与 incremental.bin；三者与完整安装包必须同一 Release 发布。更新清单使用既有 Tauri 私钥签名，下载源必须支持 HTTP Range。tools/test_incremental_update.py 在隔离目录验证更新、占用、篡改、启动失败和中断恢复。
