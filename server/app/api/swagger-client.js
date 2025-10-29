function replacePlaceholders(spec, replacements) {
  let json = JSON.stringify(spec);
  for (const key in replacements) {
    const re = new RegExp(`%${key}%`, 'g');
    json = json.replace(re, replacements[key]);
  }
  return JSON.parse(json);
}

async function init() {
  const options = window.swaggerDynamicOptions?.templateOptions || {};
  const spec1 = options.swaggerDoc;
  const url = options.swaggerUrl || window.location.origin;
  const urls = options.swaggerUrls;
  const customOptions = options.customOptions || {};
  const replacements = options.replacements || {};

  const replacedSpec = replacePlaceholders(spec1, replacements);

  const swaggerOptions = {
    spec: replacedSpec,
    url: url,
    urls: urls,
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    layout: 'StandaloneLayout'
  };

  for (const key in customOptions) {
    swaggerOptions[key] = customOptions[key];
  }

  const ui = SwaggerUIBundle(swaggerOptions);

  if (customOptions.oauth) ui.initOAuth(customOptions.oauth);
  if (customOptions.authAction) ui.authActions.authorize(customOptions.authAction);

  window.ui = ui;
}

window.addEventListener('load', init);
