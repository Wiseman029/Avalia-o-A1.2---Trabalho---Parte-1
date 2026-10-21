const API = 'https://api.frankfurter.dev/v2';
const Matricula = '295296';
let mode = 'latest';
let lastData = [];
let lastUrl = '';
let resultKind = 'rates';

// Mesma API de logs usada no projeto que já está funcionando.
// A matrícula do aluno deve permanecer como 295296.
const LOGS_API_BASE = 'https://www.piway.com.br/unoesc/api';
let logsViewed = false;

const $ = id => document.getElementById(id);

function dateISOToDisplay(date) {
  if (!date) return '—';
  const [y, m, d] = String(date).split('T')[0].split('-');
  if (!y || !m || !d) return String(date);
  return `${d}/${m}/${y}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(Number(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showAlert(message, type = 'danger') {
  $('alert-box').className = `alert alert-${type}`;
  $('alert-box').textContent = message;
}

function clearAlert() {
  $('alert-box').className = 'alert d-none';
  $('alert-box').textContent = '';
}

function showLogAlert(message, type = 'danger') {
  const box = $('logs-alert');
  if (!box) return;
  box.className = `alert alert-${type}`;
  box.textContent = message;
}

function clearLogAlert() {
  const box = $('logs-alert');
  if (!box) return;
  box.className = 'alert d-none';
  box.textContent = '';
}

function switchMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('.query-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
  $('rate-fields').classList.toggle('catalog-mode', mode === 'currencies');
  $('rate-fields').classList.toggle('rates-mode', mode !== 'currencies');
  $('rate-fields').querySelectorAll('.d-none').forEach(() => {});
  $('rate-fields').classList.remove('catalog-mode');
  const show = (id, visible) => $(id).classList.toggle('d-none', !visible);
  $('base').closest('.col-md-4').classList.toggle('d-none', mode === 'currencies');
  show('quotes-wrap', mode !== 'currencies');
  show('date-wrap', mode === 'history');
  show('from-wrap', mode === 'period');
  show('to-wrap', mode === 'period');
  show('group-wrap', mode === 'period');
  show('currency-search-wrap', mode === 'currencies');
  show('currency-scope-wrap', mode === 'currencies');
  $('quotes-wrap').querySelector('.form-text').textContent = 'Separe os códigos por vírgula. Deixe vazio para consultar todas.';
  $('specific-date').required = mode === 'history';
  $('date-from').required = mode === 'period';
  $('date-to').required = mode === 'period';
  $('result-title').textContent = modeTitles()[mode];
}

function modeTitles() {
  return {
    latest: 'Cotações recentes',
    history: 'Cotação histórica',
    period: 'Histórico por período',
    currencies: 'Catálogo de moedas'
  };
}

function makeRatesUrl() {
  const params = new URLSearchParams();
  const base = $('base').value.toLowerCase();
  const quotes = $('quotes').value.trim().toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
  params.set('base', base);
  if (quotes.length) params.set('quotes', [...new Set(quotes)].join(',').toLowerCase());
  if (mode === 'history') {
    if (!$('specific-date').value) throw new Error('Selecione a data que deseja consultar.');
    params.set('date', $('specific-date').value);
  }
  if (mode === 'period') {
    const from = $('date-from').value;
    const to = $('date-to').value;
    if (!from) throw new Error('Informe a data inicial do período.');
    if (to && from > to) throw new Error('A data inicial não pode ser posterior à data final.');
    params.set('from', from);
    if (to) params.set('to', to);
    if ($('grouping').value) params.set('group', $('grouping').value);
  }
  return `${API}/rates?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let details = '';
    try {
      const body = await response.json();
      details = body.message || body.title || body.error || '';
    } catch {
      // A resposta de erro pode não estar em JSON.
    }
    throw new Error(details || `A API respondeu com status HTTP ${response.status}. Confira os filtros e tente novamente.`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Normaliza texto para interpretar mensagens de erro da API de logs.
function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function mensagemDaResposta(payload, textoBruto = '') {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const mensagem = valorDoCampo(payload, ['sucesso', 'mensagem', 'message', 'erro', 'error']);
    if (mensagem !== undefined && mensagem !== null && String(mensagem).trim()) return String(mensagem);
  }
  return String(textoBruto || '').trim();
}

function valorDoCampo(objeto, nomes) {
  if (!objeto || typeof objeto !== 'object') return undefined;
  const normalizarChave = texto => String(texto).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const nome of nomes) {
    const desejado = normalizarChave(nome);
    const entrada = Object.entries(objeto).find(([chave]) => normalizarChave(chave) === desejado);
    if (entrada) return entrada[1];
  }
  return undefined;
}

async function requisitarApiLogs(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json, text/plain, */*' }
  });
  const texto = await response.text();
  let payload = texto;
  try { payload = JSON.parse(texto); } catch { /* A API também pode retornar texto simples. */ }  
  if (!response.ok) {
    throw new Error(mensagemDaResposta(payload, texto) || `HTTP ${response.status}`);
  }
  return { payload, texto };
}

function descreverConsultaFrankfurter(url) {
  const parsed = new URL(url);
  const recurso = parsed.pathname.endsWith('/currencies') ? '/currencies' : '/rates';
  const params = parsed.searchParams.toString();
  return `GET ${recurso}${params ? `?${params}` : ''}`;
}

function resumirRespostaFrankfurter(url, resposta) {
  const isCurrencies = new URL(url).pathname.endsWith('/currencies');
  if (Array.isArray(resposta)) {
    const tipo = isCurrencies ? 'moedas' : 'cotações';
    return `${resposta.length} ${tipo} retornadas`;
  }
  if (resposta && typeof resposta === 'object') {
    return `${Object.keys(resposta).length} campos retornados`;
  }
  return 'Consulta concluída';
}

// Registra a consulta usando o mesmo formato do projeto que já funciona:
// GET /inserir/log/{matricula}/{api}/{metodo}/{resultado}
async function registrarLog(metodo, resultado) {
  if (!Matricula || !Matricula.trim()) {
    showLogAlert('Informe a matrícula do aluno antes de registrar os logs.', 'warning');
    return false;
  }

  const partes = [Matricula.trim(), 'Frankfurter', encodeURIComponent(metodo), encodeURIComponent(resultado)]
    .map(parte => encodeURIComponent(String(parte).slice(0, 180)));
  const url = `${LOGS_API_BASE}/inserir/log/${partes.join('/')}`;

  try {
    await requisitarApiLogs(url);
    showLogAlert('Consulta à Frankfurter registrada na API de logs.', 'success');
    return true;
  } catch (error) {
    console.warn('Não foi possível registrar o log:', error);
    showLogAlert('Não foi possível registrar o log. Confira a matrícula e a conexão com a API de logs.', 'danger');
    return false;
  }
}

function extractLogs(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const chave of ['logs', 'data', 'resultado', 'sucesso', 'SUCESSO']) {
    if (Array.isArray(payload[chave])) return payload[chave];
  }
  return null;
}

function getLogId(log) {
  return valorDoCampo(log, ['idlog', 'id_log', 'idLog', 'id']);
}

function getLogDate(log) {
  const value = valorDoCampo(log, ['data', 'datahora', 'created_at', 'createdAt', 'dataregistro', 'timestamp']);
  if (!value) return 'Data não informada';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('pt-BR');
}

function renderLogs(logs) {
  const container = $('logs-list');
  if (!container) return;

  if (!logs.length) {
    container.innerHTML = '<p class="text-muted mb-0">Nenhum log foi registrado para esta matrícula.</p>';
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-striped table-hover align-middle">
        <thead><tr><th>Data/Hora</th><th>API</th><th>Operação</th><th>Resultado</th><th>Ação</th></tr></thead>
        <tbody>
          ${logs.map((log, index) => {
            const id = getLogId(log);
            const api = valorDoCampo(log, ['api', 'nomeapi']) ?? 'Frankfurter';
            const metodo = valorDoCampo(log, ['metodo', 'method', 'nomeMetodo', 'operacao']) ?? 'Operação não informada';
            const resultado = valorDoCampo(log, ['resultado', 'result', 'resposta', 'response']) ?? 'Resultado não informado';
            const idTexto = id !== undefined && id !== null && id !== '' ? String(id) : '';
            return `<tr>
              <td>${escapeHtml(getLogDate(log))}</td>
              <td>${escapeHtml(api)}</td>
              <td class="text-break">${escapeHtml(decodeURIComponent(decodeURIComponent(metodo)))}</td>
              <td class="text-break">${escapeHtml(decodeURIComponent(decodeURIComponent(resultado)))}</td>
              <td>${idTexto
                ? `<button type="button" class="btn btn-sm btn-outline-danger" data-delete-log="${escapeHtml(idTexto)}">Excluir</button>`
                : `<span class="text-muted">ID indisponível</span>`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function carregarLogs(silencioso = false) {
  logsViewed = true;
  const container = $('logs-list');
  if (!silencioso) {
    clearLogAlert();
    if (container) container.innerHTML = '<p class="text-muted">Carregando logs...</p>';
  }

  try {
    const url = `${LOGS_API_BASE}/logs/${encodeURIComponent(Matricula.trim())}`;
    const { payload } = await requisitarApiLogs(url);
    const logs = extractLogs(payload);
    if (!logs) throw new Error('A resposta da API não contém uma lista de logs reconhecida.');
    renderLogs(logs);
    showLogAlert(`${logs.length} ${logs.length === 1 ? 'log encontrado' : 'logs encontrados'}.`, 'success');
  } catch (error) {
    console.warn('Falha ao consultar logs:', error);
    if (container) container.innerHTML = `<p class="text-muted">${escapeHtml(error.message || 'Erro ao consultar logs.')}</p>`;
    showLogAlert('Não foi possível consultar os logs. Verifique a matrícula e tente novamente.', 'danger');
  }
}

async function excluirLog(id) {
  if (!confirm('Deseja realmente excluir este log?')) return;

  clearLogAlert();
  try {
    // A API da disciplina usa GET para exclusão, igual ao código já funcional.
    const url = `${LOGS_API_BASE}/excluir/log/${encodeURIComponent(id)}/aluno/${encodeURIComponent(Matricula.trim())}`;
    const { payload, texto } = await requisitarApiLogs(url);
    const mensagem = mensagemDaResposta(payload, texto);
    if (normalize(mensagem).includes('nenhum log foi excluido')) {
      showLogAlert(`A API informou: ${mensagem}`, 'warning');
    } else {
      showLogAlert(mensagem || 'Solicitação de exclusão enviada.', 'success');
    }
    await carregarLogs(true);
  } catch (error) {
    console.warn('Falha ao excluir log:', error);
    showLogAlert('Não foi possível excluir este log. Confira a matrícula e tente novamente.', 'danger');
  }
}

async function runQuery(event) {
  event?.preventDefault();
  clearAlert();
  const button = $('submit-query');
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Consultando...';
  $('results').classList.add('d-none');

  try {
    let data;
    let url;
    let apiResponse;

    if (mode === 'currencies') {
      const params = new URLSearchParams();
      if ($('currency-scope').value) params.set('scope', $('currency-scope').value);
      url = `${API}/currencies${params.size ? `?${params}` : ''}`;
      apiResponse = await fetchJson(url);
      data = Array.isArray(apiResponse) ? [...apiResponse] : [];

      const term = $('currency-search').value.trim().toLocaleLowerCase('pt-BR');
      if (term) {
        data = data.filter(c => `${c.iso_code} ${c.name} ${c.symbol || ''}`
          .toLocaleLowerCase('pt-BR').includes(term));
      }
      resultKind = 'currencies';
    } else {
      url = makeRatesUrl();
      apiResponse = await fetchJson(url);
      data = Array.isArray(apiResponse) ? apiResponse : [];
      resultKind = 'rates';
    }

    // Registra a consulta depois de receber a resposta da Frankfurter.
    // Se a API de logs falhar, os resultados principais continuam visíveis.
    await registrarLog(descreverConsultaFrankfurter(url), resumirRespostaFrankfurter(url, apiResponse));

    lastUrl = url;
    lastData = data;
    renderResults(data, url);

    if (!data.length) {
      showAlert('A consulta foi concluída, mas não retornou registros para os parâmetros selecionados.', 'warning');
    }

    // Se os logs já foram abertos, atualiza a lista após a nova consulta.
    if (logsViewed && $('logs-panel') && !$('logs-panel').classList.contains('d-none')) {
      await carregarLogs(true);
    }
  } catch (error) {
    showAlert(error instanceof TypeError
      ? 'Não foi possível conectar à API. Verifique a internet e tente executar o projeto pelo Live Server. A API também pode estar temporariamente indisponível.'
      : error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="bi bi-search me-2"></i>Buscar dados';
  }
}

function renderResults(data, url) {
  $('results').classList.remove('d-none');
  $('result-title').textContent = modeTitles()[mode];
  $('result-description').textContent = `${data.length} registro(s) exibido(s) · Endpoint: ${decodeURIComponent(decodeURIComponent(url))}`;
  $('record-count').textContent = `${data.length} ${data.length === 1 ? 'registro' : 'registros'}`;
  $('table-source').textContent = `Fonte: Frankfurter API v2 · ${decodeURIComponent(decodeURIComponent(url))}`;
  if (resultKind === 'currencies') renderCurrencies(data);
  else renderRates(data);
  $('json-content').textContent = JSON.stringify(data, null, 2);
  $('json-panel').classList.add('d-none');
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRates(data) {
  $('table-title').textContent = 'Cotações recebidas';
  $('table-caption').textContent = 'Cada linha corresponde a uma cotação retornada pela API.';
  $('table-head').innerHTML = '<tr><th>#</th><th>Data</th><th>Base</th><th>Moeda cotada</th><th>Taxa</th></tr>';
  $('table-body').innerHTML = data.map((item, index) => `<tr>
    <td class="index-cell">${index + 1}</td><td>${escapeHtml(dateISOToDisplay(item.date))}</td>
    <td><span class="currency-code">${escapeHtml(item.base)}</span></td>
    <td><span class="currency-code quote">${escapeHtml(item.quote)}</span></td>
    <td class="rate-cell">${escapeHtml(formatNumber(item.rate))}</td></tr>`).join('');

  const uniqueRates = [...new Set(data.map(item => Number(item.rate)))];
  $('distinct-count').textContent = `${uniqueRates.length} ${uniqueRates.length === 1 ? 'valor' : 'valores'}`;
  $('distinct-values').innerHTML = uniqueRates.length
    ? uniqueRates.map(rate => `<span class="distinct-chip">${escapeHtml(formatNumber(rate))}</span>`).join('')
    : '<p class="empty-state">Sem valores para exibir.</p>';

  $('summary-cards').innerHTML = [
    ['Registros retornados', data.length, 'Itens na consulta'],
    ['Moedas cotadas', new Set(data.map(item => item.quote)).size, 'Códigos distintos'],
    ['Taxas diferentes', uniqueRates.length, 'Valores numéricos únicos']
  ].map(card => `<article class="summary-card"><span>${card[0]}</span><strong>${card[1]}</strong><small>${card[2]}</small></article>`).join('');
}

function renderCurrencies(data) {
  $('table-title').textContent = 'Moedas disponíveis';
  $('table-caption').textContent = 'Catálogo de moedas retornado pelo endpoint /currencies.';
  $('table-head').innerHTML = '<tr><th>#</th><th>Código ISO</th><th>Nome</th><th>Símbolo</th><th>Início dos dados</th></tr>';
  $('table-body').innerHTML = data.map((item, index) => `<tr>
    <td class="index-cell">${index + 1}</td><td><span class="currency-code">${escapeHtml(item.iso_code)}</span></td>
    <td class="currency-name">${escapeHtml(item.name)}</td><td>${escapeHtml(item.symbol || '—')}</td>
    <td>${escapeHtml(item.start_date ? dateISOToDisplay(item.start_date) : '—')}</td></tr>`).join('');

  const uniqueCodes = [...new Set(data.map(item => item.iso_code))];
  $('distinct-count').textContent = `${uniqueCodes.length} códigos`;
  $('distinct-values').innerHTML = uniqueCodes.length
    ? uniqueCodes.map(code => `<span class="distinct-chip">${escapeHtml(code)}</span>`).join('')
    : '<p class="empty-state">Nenhuma moeda encontrada.</p>';

  $('summary-cards').innerHTML = [
    ['Moedas exibidas', data.length, 'Após aplicar o filtro local'],
    ['Códigos únicos', uniqueCodes.length, 'Sem duplicatas'],
    ['Moedas com símbolo', data.filter(item => item.symbol).length, 'Campo de símbolo disponível']
  ].map(card => `<article class="summary-card"><span>${card[0]}</span><strong>${card[1]}</strong><small>${card[2]}</small></article>`).join('');
}

document.querySelectorAll('.query-tab').forEach(button => {
  button.addEventListener('click', () => switchMode(button.dataset.mode));
});

$('query-form').addEventListener('submit', runQuery);

$('reset-query').addEventListener('click', () => {
  $('base').value = 'EUR';
  $('quotes').value = 'USD, BRL, GBP, JPY';
  $('specific-date').value = '';
  $('date-from').value = '';
  $('date-to').value = '';
  $('grouping').value = '';
  $('currency-search').value = '';
  $('currency-scope').value = '';
  switchMode('latest');
  clearAlert();
  $('results').classList.add('d-none');
});

$('toggle-json').addEventListener('click', () => $('json-panel').classList.toggle('d-none'));

$('copy-json').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastData, null, 2));
    showAlert('JSON copiado para a área de transferência.', 'success');
  } catch {
    showAlert('Não foi possível copiar automaticamente. Abra o painel JSON e copie o conteúdo manualmente.', 'warning');
  }
});

// Eventos da área de logs: visualizar, atualizar e excluir.
if ($('show-logs')) {
  $('show-logs').addEventListener('click', async () => {
    const panel = $('logs-panel');
    panel.classList.toggle('d-none');
    if (!panel.classList.contains('d-none')) {
      logsViewed = true;
      await carregarLogs();
    }
  });
}

if ($('refresh-logs')) {
  $('refresh-logs').addEventListener('click', carregarLogs);
}

if ($('logs-list')) {
  $('logs-list').addEventListener('click', event => {
    const button = event.target.closest('[data-delete-log]');
    if (button) excluirLog(button.dataset.deleteLog);
  });
}

switchMode('latest');
