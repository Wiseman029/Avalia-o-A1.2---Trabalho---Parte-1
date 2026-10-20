const API = 'https://api.frankfurter.dev/v2';
let mode = 'latest';
let lastData = [];
let lastUrl = '';
let resultKind = 'rates';

const $ = id => document.getElementById(id);

function dateISOToDisplay(date) {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(Number(value));
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showAlert(message, type = 'danger') {
  $('alert-box').className = `alert alert-${type}`;
  $('alert-box').textContent = message;
}
function clearAlert() {
  $('alert-box').className = 'alert d-none';
  $('alert-box').textContent = '';
}
function switchMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll('.query-tab').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
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
  return { latest: 'Cotações recentes', history: 'Cotação histórica', period: 'Histórico por período', currencies: 'Catálogo de moedas' };
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
    const from = $('date-from').value, to = $('date-to').value;
    if (!from) throw new Error('Informe a data inicial do período.');
    if (to && from > to) throw new Error('A data inicial não pode ser posterior à data final.');
    params.set('from', from);
    if (to) params.set('to', to);
    if ($('grouping').value) params.set('group', $('grouping').value);
  }
  return `${API}/rates?${params.toString()}`;
}
async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    let details = '';
    try { const body = await response.json(); details = body.message || ''; } catch {}
    throw new Error(details || `A API respondeu com status HTTP ${response.status}. Confira os filtros e tente novamente.`);
  }
  return response.json();
}
async function runQuery(event) {
  event?.preventDefault();
  clearAlert();
  const button = $('submit-query');
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Consultando...';
  $('results').classList.add('d-none');
  try {
    let data, url;
    if (mode === 'currencies') {
      const params = new URLSearchParams();
      if ($('currency-scope').value) params.set('scope', $('currency-scope').value);
      url = `${API}/currencies${params.size ? `?${params}` : ''}`;
      data = await fetchJson(url);
      const term = $('currency-search').value.trim().toLocaleLowerCase('pt-BR');
      if (term) data = data.filter(c => `${c.iso_code} ${c.name} ${c.symbol || ''}`.toLocaleLowerCase('pt-BR').includes(term));
      resultKind = 'currencies';
    } else {
      url = makeRatesUrl();
      data = await fetchJson(url);
      resultKind = 'rates';
    }
    lastUrl = url;
    lastData = data;
    renderResults(data, url);
    if (!data.length) showAlert('A consulta foi concluída, mas não retornou registros para os parâmetros selecionados.', 'warning');
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
  $('result-description').textContent = `${data.length} registro(s) exibido(s) · Endpoint: ${url}`;
  $('record-count').textContent = `${data.length} ${data.length === 1 ? 'registro' : 'registros'}`;
  $('table-source').textContent = `Fonte: Frankfurter API v2 · ${url}`;
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
  $('distinct-values').innerHTML = uniqueRates.length ? uniqueRates.map(rate => `<span class="distinct-chip">${escapeHtml(formatNumber(rate))}</span>`).join('') : '<p class="empty-state">Sem valores para exibir.</p>';
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
  $('distinct-values').innerHTML = uniqueCodes.length ? uniqueCodes.map(code => `<span class="distinct-chip">${escapeHtml(code)}</span>`).join('') : '<p class="empty-state">Nenhuma moeda encontrada.</p>';
  $('summary-cards').innerHTML = [
    ['Moedas exibidas', data.length, 'Após aplicar o filtro local'],
    ['Códigos únicos', uniqueCodes.length, 'Sem duplicatas'],
    ['Moedas com símbolo', data.filter(item => item.symbol).length, 'Campo de símbolo disponível']
  ].map(card => `<article class="summary-card"><span>${card[0]}</span><strong>${card[1]}</strong><small>${card[2]}</small></article>`).join('');
}
document.querySelectorAll('.query-tab').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
$('query-form').addEventListener('submit', runQuery);
$('reset-query').addEventListener('click', () => {
  $('base').value = 'EUR'; $('quotes').value = 'USD, BRL, GBP, JPY';
  $('specific-date').value = ''; $('date-from').value = ''; $('date-to').value = '';
  $('grouping').value = ''; $('currency-search').value = ''; $('currency-scope').value = '';
  switchMode('latest'); clearAlert(); $('results').classList.add('d-none');
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
switchMode('latest');
