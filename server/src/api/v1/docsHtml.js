// /api/v1/docs - 简易文档页（使用 Swagger UI CDN，单文件无依赖）
// 浏览器打开后会自动请求 /api/v1/openapi.json 渲染
export const docsHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>SOW→WBS API v1 文档</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 20px 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        layout: 'BaseLayout',
        docExpansion: 'list',
        presets: [SwaggerUIBundle.presets.apis],
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`;
