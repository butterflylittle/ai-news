# AI 今日雷达

私人、本地优先的资讯工作台，关注 AI、独立站、SEO、GEO 和 Shopify。每天北京时间 09:00 聚合 RSS，也可以在页面右上角手动刷新。

## 启动

```bash
cp .env.example .env
docker compose up --build -d
```

打开 <http://localhost:4173>。

RSSHub 运行在 Compose 内部，不对宿主机暴露端口。数据和每日 Markdown 分别保存在 `data/store.json` 与 `data/daily/`，删除容器不会丢失。

## 配置数据源

编辑 `config/feeds.json`：

- `enabled`：是否参与采集
- `weight`：来源基础权重，建议 10–35
- `primary`：是否为一手来源
- `allowAll`：是否允许不命中关注关键词的条目；专业主题信源开启此项，避免漏掉未直接提及主题名称的更新
- `defaultCategory`：可选，未命中重点主题时使用的默认分类，例如 `Shopify` 或 `独立站`
- `includeCategory`：可选，仅保留 RSS 中带有指定分类的条目；AppSo 使用此项从爱范儿主站 RSS 中筛选
- `platform`：`official`、`developer`、`research`、`media`、`x`、`douyin` 或 `xiaohongshu`

关键词配置在 `config/keywords.json`：`global` 保留 AI、FDE、AI Coding、Agent Skills 和新 AI 产品关键词；`topics` 定义独立站、SEO、GEO 和 Shopify 的主题关键词，也参与收录筛选和评分。分类先匹配 `topics`，再使用信源的 `defaultCategory`，最后匹配原有 `categories`；同组按命中数选择，平局时按配置顺序选择。英文主题词及 AI、SEO、GEO 等短缩写按词边界匹配，并兼容 LLMs、AI Overviews 等加 s 的复数，避免将 geography 或 AI models 误判为 GEO。

### 独立站、SEO、GEO 与 Shopify

以下公开 RSS 默认启用，无需密钥或 RSSHub：

| 信源 | 主要内容 |
| --- | --- |
| [Shopify 商家更新](https://changelog.shopify.com/feed.xml) | 店铺管理、结账、支付、营销与平台更新 |
| [Shopify 开发者更新](https://shopify.dev/changelog/feed.xml) | 应用、主题、Storefront 与 API 变更 |
| [Practical Ecommerce](https://www.practicalecommerce.com/feed) | 独立站运营、转化、物流和电商增长 |
| [Google Search Central](https://feeds.feedburner.com/blogspot/amDG) | Google 搜索、抓取、索引和 Search Console 官方动态 |
| [Search Engine Journal · SEO](https://www.searchenginejournal.com/category/seo/feed/) | SEO 行业动态及 AI 搜索优化 |
| [Ahrefs Blog](https://ahrefs.com/blog/feed/) | SEO 实践、AI 搜索可见性与研究 |

GEO 指生成式引擎优化，覆盖 AEO、AI Search、AI Overviews、AI 可见性等相关主题；通过上述搜索专业信源中的关键词识别。

新增来源沿用最近七天保留、跨源去重和每日 Markdown 归档。运行 `npm run refresh` 后，雷达页会自动展示有文章的主题筛选，信源页可查看各来源的采集状态。

### 自动中文翻译

每次采集完成后，系统会将英文标题和摘要翻译为简体中文，页面与每日 Markdown 优先显示译文。标题链接仍指向原始文章，悬停在译文标题上可查看原文标题；搜索同时匹配中英文。

默认使用 Google Translate 的免密钥网页接口，无需新增环境变量或依赖。只有公开资讯的标题和摘要会发送到翻译服务，正文不会发送。该接口并非正式 Cloud Translation API，可能受网络、限流或接口变更影响。

`data/store.json` 中的 `title`、`summary` 和 `url` 保留原文，`titleZh`、`summaryZh` 保存译文。分类、排序和去重继续使用原文；翻译按原文内容复用缓存，新增或修改的字段才会重新请求。已有中文内容、空摘要和纯版本号不请求翻译。

最多同时发起 3 个翻译请求，单次请求最长等待 12 秒，整个翻译阶段最长等待 2 分钟；累计 3 次请求失败后停止安排新请求。失败字段回退原文，下次刷新重试，成功译文仍会保存。`meta.translation` 与刷新命令输出记录新增、缓存和待重试字段数量。

字节跳动技术团队、腾讯技术工程和阿里技术的文章通过第三方公众号转 RSS 服务读取，保留原文链接和发布时间，并按关注关键词筛选；这些信源无需额外密钥。

### X 全球热榜

在 `.env` 填写 `X_BEARER_TOKEN`。系统调用 X API v2 的全球 Trends 接口，并只保留命中关注关键词的趋势；未配置时，信源页会显示“待配置”，不会拖慢其他 RSS。

抖音示例路由默认关闭，因为 RSSHub 路由会随平台反爬策略变化。确认 `/douyin/hot` 在当前镜像可用后再开启。

### 小红书热门帖子

RSSHub 目前没有全站热门帖子路由，因此这里采用“AI 创作者账号池”：合并多个用户笔记 RSS，读取 RSSHub 输出的点赞数，在最近七天内容中选出热门帖子。

1. 在 `.env` 的 `XIAOHONGSHU_USER_IDS` 中填写逗号分隔的 24 位创作者 ID。
2. 在 `.env` 中填写登录态 `XIAOHONGSHU_COOKIE`。
3. 本地开发时将 `RSSHUB_BASE` 改为本机 RSSHub 地址，例如 `http://localhost:1200`。

默认最低点赞数为 50、最多保留 30 条，可在 `config/feeds.json` 中调整 `minUpvotes` 和 `maxItems`。

不要提交 `.env`。

## 本地开发

页面地址：`/`（今日）、`/radar`（雷达）、`/sources`（信源）、`/archive`（归档）。四个页面共用导航、资讯数据、刷新状态以及本地收藏/隐藏记录。

雷达的搜索和筛选会同步到 URL：`category` 表示主题、`platform` 表示平台、`source` 表示信源 ID、`q` 表示搜索词、`hidden=1` 表示包括隐藏。信源页使用 `platform` 参数，例如 `/sources?platform=official`。

可以直接打开或收藏 `/radar?category=GEO`、`/radar?source=shopify-changelog` 等地址；刷新页面和浏览器前进/后退会恢复 URL 中的条件。筛选切换会新增历史记录，搜索输入替换当前记录，默认“全部”和空搜索不写入参数。信源名称与平台链接会跳转到相应的雷达筛选结果。

VitePress 为每个页面生成独立 HTML，本地生产服务和 Vercel 均支持不带 `.html` 的地址；未知地址显示 404。

```bash
npm install
npm run dev
```

开发服务会在 <http://localhost:5173> 提供同样的刷新 API，但不会启动 09:00 调度。生产 Docker 服务才会执行每日任务。

```bash
npm test       # 解析、聚类、排序、Markdown 与时区调度
npm run build  # VitePress 生产构建
npm run refresh
```

## 排序规则

排序只使用可解释规则：来源权重、新鲜度、关键词、一手来源和跨源印证。没有接入 Jev，也没有用 LLM 判断价值。收藏和隐藏状态保存在浏览器 `localStorage`。

## Vercel 部署

项目使用 `vercel.json` 固定构建设置。Vercel 会运行 `npm run build`，将最新的 `data/store.json` 复制到静态站点，再发布 `docs/.vitepress/dist`。

Vercel 环境变量：

- `GH_ACTIONS_TOKEN`：仅授权本仓库、具有 Actions 读写权限的 GitHub fine-grained PAT。
- `REFRESH_SECRET`：手动刷新密钥；线上首次点击刷新时输入，值只保存在当前浏览器会话。

GitHub Actions Secrets：

- `X_BEARER_TOKEN`
- `XIAOHONGSHU_COOKIE`
- `XIAOHONGSHU_USER_IDS`

`.github/workflows/refresh.yml` 每天北京时间 09:00 运行，也接受线上按钮触发。工作流提交新的 JSON/Markdown 后，Vercel 的 Git 集成会自动发布。
