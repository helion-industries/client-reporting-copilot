function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeHexColor(color) {
  const value = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1f6feb';
}

function renderSectionContent(content) {
  const text = String(content || '').trim();
  if (!text) {
    return '<p>No content available.</p>';
  }

  if (text.includes('\n- ') || text.startsWith('- ')) {
    const items = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*]\s*/, ''));

    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  if (/^\d+\.\s/m.test(text)) {
    const items = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\d+\.\s*/, ''));

    return `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
  }

  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br />')}</p>`)
    .join('');
}

function buildReportHtml({ agency, client, report, shareUrl = null, isShared = false }) {
  const brandColor = normalizeHexColor(agency?.brand_color);
  const logoUrl = agency?.logo_url ? escapeHtml(agency.logo_url) : null;
  const reportSections = Object.values(report?.sections || {});

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(client?.name)} Report — ${escapeHtml(report?.period)}</title>
    <style>
      :root {
        --brand-color: ${brandColor};
        --text: #17202a;
        --muted: #5b6672;
        --border: #dfe7ef;
        --bg: #f5f7fb;
        --surface: #ffffff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, Arial, sans-serif;
        color: var(--text);
        background: var(--bg);
        line-height: 1.55;
      }
      .page {
        max-width: 960px;
        margin: 32px auto;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
      }
      .hero {
        padding: 32px;
        border-top: 6px solid var(--brand-color);
        background: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(245,247,251,1) 100%);
      }
      .agency-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
      }
      .agency-mark {
        display: flex;
        gap: 14px;
        align-items: center;
      }
      .agency-logo {
        max-height: 52px;
        max-width: 180px;
        object-fit: contain;
      }
      .agency-name {
        font-size: 28px;
        font-weight: 700;
        margin: 0;
      }
      .eyebrow, .meta, .share-note {
        color: var(--muted);
      }
      .client-title {
        margin: 28px 0 10px;
        font-size: 32px;
        line-height: 1.15;
      }
      .accent-chip {
        display: inline-block;
        margin-top: 14px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--brand-color);
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .body {
        padding: 0 32px 32px;
      }
      .section {
        padding: 24px 0;
        border-top: 1px solid var(--border);
      }
      .section h2 {
        margin: 0 0 12px;
        font-size: 22px;
        color: var(--brand-color);
      }
      p, li {
        font-size: 16px;
      }
      ul, ol {
        margin: 0;
        padding-left: 22px;
      }
      .footer {
        padding: 24px 32px 32px;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 14px;
      }
      a { color: var(--brand-color); }
      @media print {
        body { background: #fff; }
        .page { margin: 0; box-shadow: none; border: 0; }
      }
    </style>
  </head>
  <body>
    <article class="page">
      <header class="hero">
        <div class="agency-row">
          <div class="agency-mark">
            ${logoUrl ? `<img class="agency-logo" src="${logoUrl}" alt="${escapeHtml(agency?.name)} logo" />` : ''}
            <div>
              <p class="eyebrow">Prepared by</p>
              <h1 class="agency-name">${escapeHtml(agency?.name || 'Agency')}</h1>
            </div>
          </div>
          <div class="meta">
            <div>Generated report</div>
            <div>${escapeHtml(report?.period || '')}</div>
          </div>
        </div>
        <h2 class="client-title">${escapeHtml(client?.name || 'Client')} — Performance Report</h2>
        <p class="meta">Reporting period: ${escapeHtml(report?.period || '')}</p>
        <span class="accent-chip">${isShared ? 'Shared client view' : 'Agency preview'}</span>
        ${shareUrl ? `<p class="share-note">Share link: <a href="${escapeHtml(shareUrl)}">${escapeHtml(shareUrl)}</a></p>` : ''}
      </header>
      <main class="body">
        ${reportSections
          .map(
            (section) => `<section class="section">
              <h2>${escapeHtml(section.title || 'Section')}</h2>
              ${renderSectionContent(section.content)}
            </section>`
          )
          .join('')}
      </main>
      <footer class="footer">
        <div>${escapeHtml(agency?.name || 'Agency')} prepared this report for ${escapeHtml(client?.name || 'Client')}.</div>
      </footer>
    </article>
  </body>
</html>`;
}

function buildEmailDraft({ agency, client, report, shareUrl }) {
  const executiveSummary = String(report?.sections?.executive_summary?.content || '').trim() || 'Summary unavailable.';
  const subject = `${client?.name} ${report?.period} performance report`;
  const signoffName = agency?.name || 'Your agency team';

  return {
    subject,
    body: [
      `Subject: ${subject}`,
      '',
      `Hi ${client?.name} team,`,
      '',
      `Here’s your ${report?.period} performance report.`,
      '',
      'Executive summary:',
      executiveSummary,
      '',
      'Full report:',
      shareUrl,
      '',
      `Best,`,
      signoffName,
    ].join('\n'),
  };
}

module.exports = {
  buildEmailDraft,
  buildReportHtml,
  escapeHtml,
  normalizeHexColor,
};
