# 守岸人语音通话 PWA

基于阿里云 qwen3.5-omni 的实时语音通话应用。

## 部署步骤（Vercel，免费）

### 第一步：获取阿里云 API Key
1. 打开 https://bailian.console.aliyun.com/
2. 登录阿里云账号
3. 点击左侧「API-KEY管理」
4. 点击「创建 API Key」
5. 复制生成的 API Key

### 第二步：部署到 Vercel
1. 打开 https://vercel.com
2. 用 GitHub 账号登录（没有就注册一个）
3. 点击「Add New...」→「Project」
4. 选择「Import Git Repository」或直接拖拽文件夹上传
5. 点击「Deploy」
6. 等待1-2分钟，部署完成

### 第三步：使用
1. 打开 Vercel 给你的网址
2. 输入阿里云 API Key
3. 点击麦克风开始通话
4. 手机上可以「添加到主屏幕」像 App 一样使用

## 文件说明
- `index.html` - 主页面
- `app.js` - 前端逻辑
- `manifest.json` - PWA配置
- `sw.js` - Service Worker（离线缓存）
- `vercel.json` - Vercel配置

## 注意事项
- API Key 只保存在浏览器本地，不会上传
- 需要允许浏览器访问麦克风
- 建议使用 Chrome 或 Safari 浏览器
