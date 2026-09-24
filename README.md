# AI 今日雷达

私人、本地优先的 AI 资讯工作台。每天北京时间 09:00 聚合 RSS，也可以在页面右上角手动刷新。

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
- `allowAll`：是否允许不命中 AI 关键词的条目
- `platform`：`official`、`developer`、`research`、`media`、`x`、`douyin` 或 `xiaohongshu`

重点主题配置在 `config/keywords.json`。首版重点关注 FDE、AI Coding、Agent Skills 和新 AI 产品。

### X 全球热榜

在 `.env` 填写 `X_BEARER_TOKEN`。系统调用 X API v2 的全球 Trends 接口，并只保留命中 AI 关键词的趋势；未配置时，信源页会显示“待配置”，不会拖慢其他 RSS。

抖音示例路由默认关闭，因为 RSSHub 路由会随平台反爬策略变化。确认 `/douyin/hot` 在当前镜像可用后再开启。

### 小红书热门帖子

RSSHub 目前没有全站热门帖子路由，因此这里采用“AI 创作者账号池”：合并多个用户笔记 RSS，读取 RSSHub 输出的点赞数，在最近七天内容中选出热门帖子。

1. 在 `.env` 的 `XIAOHONGSHU_USER_IDS` 中填写逗号分隔的 24 位创作者 ID。
2. 在 `.env` 中填写登录态 `XIAOHONGSHU_COOKIE`。
3. 本地开发时将 `RSSHUB_BASE` 改为本机 RSSHub 地址，例如 `http://localhost:1200`。

默认最低点赞数为 50、最多保留 30 条，可在 `config/feeds.json` 中调整 `minUpvotes` 和 `maxItems`。

不要提交 `.env`。

## 本地开发

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
