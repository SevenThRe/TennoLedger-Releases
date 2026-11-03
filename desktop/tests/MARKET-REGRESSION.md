# 本地市场回归

在仓库根目录执行：

```powershell
npm --prefix desktop ci
npm --prefix desktop/tests/mounted ci --ignore-scripts
npm --prefix desktop/tests/mounted test
```

mounted/package-lock.json 锁定 jsdom 29.1.1；esbuild、React 使用 desktop/package-lock.json 锁定依赖。脚本直接打包生产 QuoteOrderComposer，mock 账号与 IPC，不访问真实订单。7组覆盖外部规格、迟到目录、平台切换、编辑回传、busy和uncertain、账号隔离。

浏览器验收：

```powershell
npm --prefix desktop exec vite -- --host 127.0.0.1 --port 4320 --strictPort desktop
```

用 CUA 打开 http://127.0.0.1:4320/tests/browser/relic-market.html 。实际 RelicOverview、TradeSidebar、主壳样式，合成Axi变体/不可交易奖励、当前本地公开种子及真实物品目录；native=false，不操作真实账户。fixture入口显式列出全部CSS依赖，包括inventoryToolbar.css（交易栏搜索SVG）、market.css、eventSidebar.css（交易栏隔离）。

点击奖励名称/价格/概率、Enter、Space应各触发一次；无slug禁用不触发。切光辉和英文后目标仍为奖励id/slug，不携带subtype。记录布局按钮把computedStyle/rect及事件写入页面。宽度1400/1220/1200/1000分别检查正常、650容器断点两侧和窄栏；缩放1.25后滚动详情验证地点可读。截图通过CUA保存，不能用源码断言代替。
