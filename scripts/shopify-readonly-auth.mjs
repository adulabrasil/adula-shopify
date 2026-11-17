// Only fixed diagnostic text and allowlisted codes may reach the terminal.
// OAuth response bodies, headers, credentials and tokens are never logged or saved.
const TARGET_SHOP = 'adula-brasil.myshopify.com';
const OAUTH_CODES = new Set(['shop_not_permitted','app_not_installed','application_cannot_be_found',
  'invalid_client','invalid_request','unsupported_grant_type','unauthorized_client','invalid_scope','access_denied']);
const DETAILS = {
  shop_not_permitted: ['ORGANIZATION_OR_GRANT', 'A Shopify recusou client_credentials para esta loja. Uma instalação não comprova que app e loja pertencem à mesma organização.', 'Compare a organização proprietária do app com a da loja oficial. Se forem diferentes, este fluxo exige OAuth authorization code; não amplie escopos nem reinstale sem verificar.'],
  app_not_installed: ['APP_INSTALLATION', 'A Shopify não reconheceu a instalação para o aplicativo identificado nesta solicitação.', 'Confira se o Client ID digitado pertence ao app de auditoria instalado especificamente em adula-brasil.myshopify.com. A contagem de uma instalação pode referir-se a outro app/loja.'],
  application_cannot_be_found: ['CLIENT_IDENTIFICATION', 'A Shopify não encontrou o aplicativo identificado pela solicitação.', 'Confira o Client ID em Configurações/Settings do mesmo app de auditoria. Não use o ID da versão, ID da instalação ou credenciais do app de fotos.'],
  invalid_client: ['CLIENT_CREDENTIALS', 'A Shopify rejeitou a identificação/autenticação do aplicativo; não é possível apontar qual campo está incorreto.', 'Confira localmente o par Client ID/Client secret do mesmo app e se o segredo vigente foi copiado integralmente, sem aspas. Não envie os valores pelo chat.'],
  invalid_request: ['REQUEST_OR_CREDENTIALS', 'A Shopify rejeitou a solicitação. Este código sozinho não distingue credenciais incorretas de configuração/formato.', 'Confira o par do mesmo app e a organização. O script envia o endpoint Admin e formulário documentados; não mude escopos nem troque o grant por tentativa.'],
  unsupported_grant_type: ['GRANT_CONFIGURATION', 'A Shopify não aceitou o tipo de concessão nesta solicitação.', 'O script usa client_credentials. Confira elegibilidade do app/organização; um app de outra organização precisa de fluxo OAuth próprio.'],
  unauthorized_client: ['GRANT_CONFIGURATION', 'A Shopify não autorizou este aplicativo a usar o fluxo solicitado.', 'Confira o tipo de aplicativo, organização e método de distribuição. A instalação não garante elegibilidade para client_credentials.'],
  invalid_scope: ['ACCESS_CONFIGURATION', 'A Shopify informou um problema de escopos.', 'Confira a versão ativa e os escopos aprovados na instalação: somente read_products e read_publications. O script não envia parâmetro scope na troca de token.'],
  access_denied: ['ACCESS_CONFIGURATION', 'A Shopify negou esta solicitação.', 'Confira instalação, organização e restrições de acesso do app. Não é prova de senha incorreta nem autorização para ampliar permissões.'],
};

export class SafeAuditError extends Error {
  constructor(code, {stage='oauth',http_status=null,oauth_code=null,category='UNCLASSIFIED',message,next_action}={}) {
    super(message || 'Não foi possível concluir esta etapa com segurança.');
    this.diagnostic={diagnostic_version:1,stage,code,category,http_status,oauth_code,
      message:this.message,next_action:next_action || 'Compartilhe somente este diagnóstico sanitizado; nunca credenciais, tokens ou resposta bruta.'};
  }
}

export function safeDiagnostic(error) {
  if(error instanceof SafeAuditError)return {...error.diagnostic};
  // Never serialize arbitrary Error.message/stack/cause: they can echo a secret.
  return new SafeAuditError('AUDIT_FAILED',{stage:'audit',category:'AUDIT_CONFIGURATION',
    message:'A auditoria foi interrompida. Nenhum detalhe bruto da exceção foi exibido.',
    next_action:'Confirme autenticação com --diagnose-auth. Se ela passar, informe em qual etapa a auditoria parou, sem enviar logs brutos.'}).diagnostic;
}

export function normalizeCredential(raw, field) {
  if(typeof raw!=='string' || !raw.trim())throw new SafeAuditError('LOCAL_CREDENTIAL_MISSING',{stage:'local_input',category:'LOCAL_INPUT',
    message:'Uma credencial obrigatória está vazia.',next_action:'Execute novamente e digite os valores somente nos prompts ocultos do terminal.'});
  const value=raw.trim(); // Handles copied CR/LF, surrounding whitespace and BOM.
  if(/[\s\p{Cc}\p{Cf}]/u.test(value) || /^['"]|['"]$/.test(value))throw new SafeAuditError('LOCAL_CREDENTIAL_FORMAT',{stage:'local_input',category:'LOCAL_INPUT',
    message:'A entrada contém aspas, espaços internos ou caracteres invisíveis; o valor não foi enviado.',
    next_action:'Copie somente o valor do campo, sem nome da variável, aspas ou quebra de linha.'});
  if(field==='client_secret' && /^(shpat_|shpua_|shptka_)/.test(value))throw new SafeAuditError('LOCAL_TOKEN_IN_SECRET_FIELD',{stage:'local_input',category:'LOCAL_INPUT',
    message:'A entrada parece ser um access token, não o Client secret; não foi enviada.',
    next_action:'Use o campo Client secret do app de auditoria. Não use um token de outra integração.'});
  return value;
}

export function oauthFailure(status, rawBody) {
  const text=typeof rawBody==='string'?rawBody:'';
  let parsed;try{parsed=JSON.parse(text);}catch{}
  let code=null;
  for(const value of [parsed?.error,parsed?.errors,parsed?.error_description]) {
    if(typeof value!=='string')continue;
    if(OAUTH_CODES.has(value)){code=value;break;}
    const match=value.match(/^Oauth\s+error\s+(\w+)\b/i);
    if(match && OAUTH_CODES.has(match[1].toLowerCase())){code=match[1].toLowerCase();break;}
  }
  if(!code && !parsed) {
    // Shopify also serves HTML error pages. Ignore all content except a known marker/code.
    const match=text.match(/\bOauth\s+error\s+(shop_not_permitted|app_not_installed|application_cannot_be_found|invalid_client|invalid_request|unsupported_grant_type|unauthorized_client|invalid_scope|access_denied)\b/i);
    if(match)code=match[1].toLowerCase();
  }
  const details=DETAILS[code];
  return new SafeAuditError(code?'OAUTH_REJECTED':'OAUTH_UNCLASSIFIED',{http_status:status,oauth_code:code,
    category:details?.[0] || 'UNCLASSIFIED_HTTP_RESPONSE',
    message:details?.[1] || 'A resposta HTTP não trouxe um código OAuth reconhecido; o status sozinho não identifica a causa.',
    next_action:details?.[2] || 'Compartilhe apenas este diagnóstico. Não envie corpo da resposta, cabeçalhos, Client secret ou tokens.'});
}

export async function acquireLocalToken({shop,env=process.env,request=fetch}) {
  if(shop!==TARGET_SHOP)throw new SafeAuditError('LOCAL_SHOP_MISMATCH',{stage:'local_input',category:'STORE_CONFIGURATION',
    message:'Este auditor está restrito a adula-brasil.myshopify.com.'});
  if(env.SHOPIFY_ADMIN_ACCESS_TOKEN) return {token:normalizeCredential(env.SHOPIFY_ADMIN_ACCESS_TOKEN,'access_token'),method:'existing_token'};
  const clientId=normalizeCredential(env.SHOPIFY_CLIENT_ID,'client_id');
  const clientSecret=normalizeCredential(env.SHOPIFY_CLIENT_SECRET,'client_secret');
  let response;
  try {
    response=await request(`https://${shop}/admin/oauth/access_token`,{
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
      body:new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:clientSecret}),
    });
  } catch {
    throw new SafeAuditError('AUTH_NETWORK_FAILURE',{category:'NETWORK_OR_TLS',message:'Não foi possível receber uma resposta HTTP da Shopify.',
      next_action:'Confira conexão, DNS, proxy e certificado com o responsável pelo computador. Não desative a validação TLS.'});
  }
  if(response.status>=300 && response.status<400)throw new SafeAuditError('AUTH_REDIRECT_REFUSED',{http_status:response.status,category:'ENDPOINT_CONFIGURATION',
    message:'O endpoint de autenticação redirecionou; as credenciais não foram reenviadas.',next_action:'Confira o domínio myshopify oficial e o endpoint Admin. Não siga links de resposta manualmente com credenciais.'});
  let raw;try{raw=await response.text();}catch{throw new SafeAuditError('AUTH_RESPONSE_UNREADABLE',{http_status:response.status});}
  if(!response.ok)throw oauthFailure(response.status,raw);
  let body;try{body=JSON.parse(raw);}catch{throw new SafeAuditError('AUTH_RESPONSE_INVALID',{http_status:response.status,category:'UNCLASSIFIED_HTTP_RESPONSE',message:'A resposta de sucesso não era JSON válido; seu conteúdo não foi exibido.'});}
  if(typeof body.access_token!=='string' || !body.access_token || /\s/.test(body.access_token))throw new SafeAuditError('AUTH_TOKEN_MISSING',{http_status:response.status,category:'UNCLASSIFIED_HTTP_RESPONSE',message:'A resposta não contém um access token válido; seu conteúdo não foi exibido.'});
  return {token:body.access_token,method:'client_credentials'};
}
