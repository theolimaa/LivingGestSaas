// ── Formatting ──────────────────────────────────────────────────────────────
export function fmtBRL(n) {
  if (isNaN(n) || n === null || n === undefined) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtBRLShort(n) {
  if (!n) return 'R$ 0'
  if (n >= 1e9) return 'R$ ' + (n / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bi'
  if (n >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M'
  if (n >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil'
  return fmtBRL(n)
}

export function fmtPct(n) {
  return (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%'
}

// ── Cents helpers ────────────────────────────────────────────────────────────
export function parseCents(val) {
  return val.replace(/\D/g, '')
}

export function fromCents(val) {
  if (!val) return ''
  return (parseInt(val) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function centsToNum(val) {
  if (!val) return 0
  return parseInt(val) / 100
}

export function numToCents(n) {
  return String(Math.round((n || 0) * 100))
}

// ── INSS 2024 (tabela progressiva) ───────────────────────────────────────────
const INSS_FAIXAS = [
  { limite: 1412.00,  aliquota: 0.075 },
  { limite: 2666.68,  aliquota: 0.09  },
  { limite: 4000.03,  aliquota: 0.12  },
  { limite: 7786.02,  aliquota: 0.14  },
]
const INSS_TETO_MENSAL = 908.86

export function calcINSSMensal(salarioBrutoMensal) {
  const s = salarioBrutoMensal || 0
  if (s <= 0) return 0
  let inss = 0
  let faixaAnterior = 0
  for (var i = 0; i < INSS_FAIXAS.length; i++) {
    const f = INSS_FAIXAS[i]
    if (s > faixaAnterior) {
      const base = Math.min(s, f.limite) - faixaAnterior
      inss += base * f.aliquota
    }
    faixaAnterior = f.limite
    if (s <= f.limite) break
  }
  return Math.min(inss, INSS_TETO_MENSAL)
}

export function calcINSSAnual(salarioBrutoMensal, meses) {
  return calcINSSMensal(salarioBrutoMensal) * (meses || 12)
}

// ── IR 2024 ──────────────────────────────────────────────────────────────────
const IR_TABLE = [
  { limite: 2259.20,  aliquota: 0,     deducao: 0 },
  { limite: 2826.65,  aliquota: 0.075, deducao: 169.44 },
  { limite: 3751.05,  aliquota: 0.15,  deducao: 381.44 },
  { limite: 4664.68,  aliquota: 0.225, deducao: 662.77 },
  { limite: Infinity, aliquota: 0.275, deducao: 896.00 },
]

export function calcIR(rendaBaseMensal) {
  const renda = rendaBaseMensal || 0
  const faixa = IR_TABLE.find(function(f) { return renda <= f.limite }) || IR_TABLE[IR_TABLE.length - 1]
  return {
    aliquotaMarginal: faixa.aliquota,
    aliquotaEfetiva: renda > 0 ? Math.max(0, (renda * faixa.aliquota - faixa.deducao) / renda) : 0,
    irMensal: Math.max(0, renda * faixa.aliquota - faixa.deducao),
    faixa: faixa.aliquota,
  }
}

// ── PGBL — lógica XP: base = bruta - INSS ────────────────────────────────────
export function calcPGBL(rendaBrutaAnual, aliquotaMarginal, inssAnual) {
  const inss = inssAnual || 0
  // Limite 12% é sobre a RENDA BRUTA (Receita Federal) — INSS não reduz a base dos 12%
  const pgblIdeal = rendaBrutaAnual * 0.12
  const economiaAnual = pgblIdeal * aliquotaMarginal
  const economiaMensal = economiaAnual / 12
  // baseLiquida = bruta - INSS (usada só para exibição e cálculo de IR)
  const baseLiquida = Math.max(0, rendaBrutaAnual - inss)
  return { pgblIdeal, economiaAnual, economiaMensal, baseLiquida }
}

// Comparativo IR sem/com PGBL (lógica Receita Federal)
// Base IR = Renda Bruta − INSS − PGBL  (deduções independentes)
export function calcComparativoIR(rendaBrutaAnual, inssAnual, pgblAporte) {
  const inss = inssAnual || 0
  const pgbl = pgblAporte || 0
  // Sem PGBL: deduz só INSS
  const baseSemPGBL = Math.max(0, rendaBrutaAnual - inss)
  // Com PGBL: deduz INSS + PGBL
  const baseComPGBL = Math.max(0, rendaBrutaAnual - inss - pgbl)

  function irAnual(baseAnual) {
    const baseMensal = baseAnual / 12
    const faixa = IR_TABLE.find(function(f) { return baseMensal <= f.limite }) || IR_TABLE[IR_TABLE.length - 1]
    return Math.max(0, baseMensal * faixa.aliquota - faixa.deducao) * 12
  }

  const irAnualSemPGBL = irAnual(baseSemPGBL)
  const irAnualComPGBL = irAnual(baseComPGBL)

  return {
    baseSemPGBL,
    baseComPGBL,
    irAnualSemPGBL,
    irAnualComPGBL,
    economia: irAnualSemPGBL - irAnualComPGBL,
  }
}

export function projetarPGBL(aporteAnual, aliquotaMarginal, anos) {
  const taxa = 0.04
  const restAnual = aporteAnual * aliquotaMarginal
  let patrimonio = 0
  let restituicoes = 0
  const dados = []
  for (let year = 1; year <= anos; year++) {
    patrimonio = (patrimonio + aporteAnual) * (1 + taxa)
    restituicoes = (restituicoes + restAnual) * (1 + taxa)
    dados.push({
      ano: year,
      patrimonioPGBL: Math.round(patrimonio),
      restituicoes: Math.round(restituicoes),
      total: Math.round(patrimonio + restituicoes),
      aportado: Math.round(aporteAnual * year),
    })
  }
  return dados
}

// ── Inventário ───────────────────────────────────────────────────────────────
export const CUSTOS_INVENTARIO = [
  { nome: 'ITCMD', pct: 0.08, cor: '#c9a84c' },
  { nome: 'Honorários Advocatícios', pct: 0.04, cor: '#4a9fd4' },
  { nome: 'Custas Cartorárias', pct: 0.03, cor: '#2ecc71' },
]

export function calcInventario(patrimonioInventariavel) {
  return CUSTOS_INVENTARIO.map(function(c) {
    return { ...c, valor: patrimonioInventariavel * c.pct }
  })
}

export function calcPatrimonioInventariavel(imoveis, patrimonioFinanceiro, veiculos, regimeCasamento) {
  function fracaoInventariavel(item) {
    if (regimeCasamento === 'separacao_total') return 1.0
    if (regimeCasamento === 'comunhao_universal') return 0.5
    return item.antesCasamento ? 1.0 : 0.5
  }
  const totalImoveis = imoveis.reduce(function(acc, im) {
    return acc + centsToNum(im.valor) * fracaoInventariavel(im)
  }, 0)
  const totalVeiculos = veiculos.reduce(function(acc, ve) {
    return acc + centsToNum(ve.valor)
  }, 0)
  let fracaoFinanceiro = 1.0
  if (regimeCasamento === 'comunhao_universal') fracaoFinanceiro = 0.5
  if (regimeCasamento === 'comunhao_parcial') fracaoFinanceiro = 0.5
  const totalFinanceiro = patrimonioFinanceiro * fracaoFinanceiro
  return {
    totalImoveis,
    totalVeiculos,
    totalFinanceiro,
    totalInventariavel: totalImoveis + totalVeiculos + totalFinanceiro,
    totalBruto: imoveis.reduce(function(acc, im) { return acc + centsToNum(im.valor) }, 0) + totalVeiculos + patrimonioFinanceiro,
  }
}

// ── File → base64 ────────────────────────────────────────────────────────────
export function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader()
    reader.onload = function() { resolve(reader.result.split(',')[1]) }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── PDF text extraction ───────────────────────────────────────────────────────
export async function extractPdfText(file) {
  if (file.type.startsWith('image/')) {
    return '[IMAGEM: ' + file.name + ']'
  }
  return new Promise(function(resolve, reject) {
    const reader = new FileReader()
    reader.onload = async function(e) {
      try {
        const typedArray = new Uint8Array(e.target.result)
        if (!window.pdfjsLib) {
          await new Promise(function(res, rej) {
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            script.onload = res
            script.onerror = rej
            document.head.appendChild(script)
          })
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        }
        const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise
        let fullText = ''
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          fullText += 'Página ' + i + ':\n' + content.items.map(function(item) { return item.str }).join(' ') + '\n\n'
        }
        resolve(fullText.trim() || 'Não foi possível extrair texto.')
      } catch (err) {
        resolve('Erro ao ler PDF: ' + err.message)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// ── API call (via proxy) ──────────────────────────────────────────────────────
export async function callClaude(messages, maxTokens) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: maxTokens || 2000,
      messages: messages,
    }),
  })
  if (!response.ok) {
    const txt = await response.text()
    throw new Error('API error ' + response.status + ': ' + txt.slice(0, 200))
  }
  const data = await response.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return (data.content || []).map(function(b) { return b.text || '' }).join('')
}

// ── ID generator ─────────────────────────────────────────────────────────────
export function genId() {
  return Math.random().toString(36).slice(2, 9)
}
