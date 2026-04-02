const OpenAI = require('openai');

const DEFAULT_REPORT_TEMPLATE = {
  sections: [
    {
      key: 'executive_summary',
      title: 'Executive Summary',
      instruction:
        'Write a concise executive summary in 2-3 paragraphs. Focus on the overall narrative, key trends, and whether the client should feel encouraged or concerned.',
    },
    {
      key: 'kpi_highlights',
      title: 'KPI Highlights',
      instruction:
        'List the most important KPI highlights. Include period-over-period comparisons when the data supports it. Use concise bullets or short paragraphs.',
    },
    {
      key: 'anomalies',
      title: 'Anomalies',
      instruction:
        'Identify significant anomalies, outliers, sudden changes, or unexpected patterns worth investigating. Be specific and practical.',
    },
    {
      key: 'wins',
      title: 'Wins',
      instruction:
        'Highlight positive outcomes, momentum, or strong performance worth celebrating with the client.',
    },
    {
      key: 'losses',
      title: 'Losses / Areas of Concern',
      instruction:
        'State negative trends, underperformance, or risks honestly and clearly. Keep the tone professional and direct.',
    },
    {
      key: 'recommendations',
      title: 'Recommendations',
      instruction:
        'Provide 3-5 actionable next-step recommendations based on the data. Prioritize actions with practical business impact.',
    },
  ],
};

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_AI_ROWS = 50;

function normalizeTemplateConfig(templateConfig) {
  const incoming = templateConfig && Array.isArray(templateConfig.sections)
    ? templateConfig.sections
    : DEFAULT_REPORT_TEMPLATE.sections;

  const mergedSections = incoming.map((section) => {
    const defaultSection = DEFAULT_REPORT_TEMPLATE.sections.find((item) => item.key === section.key);
    return {
      key: section.key,
      title: section.title || defaultSection?.title || section.key,
      instruction: section.instruction || defaultSection?.instruction || '',
    };
  });

  return { sections: mergedSections };
}

function buildSectionPrompt({ clientName, period, headers, rows, section }) {
  return [
    'You are a client reporting analyst for a marketing agency.',
    `Client name: ${clientName}`,
    `Reporting period: ${period}`,
    `Section: ${section.title}`,
    '',
    'Instructions:',
    section.instruction,
    '',
    `Data columns: ${headers.join(', ')}`,
    `Data rows (first ${Math.min(rows.length, MAX_AI_ROWS)} max): ${JSON.stringify(rows, null, 2)}`,
    '',
    'Requirements:',
    '- Write in a professional, direct tone.',
    '- Ground your answer in the supplied data only.',
    '- Do not mention missing context unless necessary.',
    '- Return plain text content only for this section.',
  ].join('\n');
}

function createMockSection(section, { clientName, period, rowCount }) {
  const templates = {
    executive_summary: `Mock executive summary for ${clientName} covering ${period}. The imported dataset contains ${rowCount} rows, and overall performance appears stable enough to support a client-ready summary once a live API key is configured. This placeholder exists so report generation can be tested without OpenAI credentials.`,
    kpi_highlights: `- Mock KPI highlight: ${rowCount} rows were processed for ${period}.\n- Mock KPI highlight: Primary trends should be reviewed against the imported headers and values.\n- Mock KPI highlight: Configure OPENAI_API_KEY for live narrative analysis.`,
    anomalies: `Mock anomaly analysis for ${clientName}: review unexpected spikes, drops, and outliers in the imported data. This is placeholder content returned because OPENAI_API_KEY is not set.`,
    wins: `Mock wins for ${clientName}: identify channels, campaigns, or metrics that outperformed expectations during ${period}.`,
    losses: `Mock losses for ${clientName}: review weaker metrics, declining trends, and any areas of concern surfaced in the dataset for ${period}.`,
    recommendations: `1. Review the strongest and weakest metrics in the imported data.\n2. Confirm priorities for the next reporting cycle.\n3. Add OPENAI_API_KEY to enable live recommendations.`,
  };

  return templates[section.key] || `Mock section content for ${section.title}.`;
}

class ReportGenerationError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'ReportGenerationError';
    this.statusCode = statusCode;
  }
}

class ReportEngine {
  constructor(options = {}) {
    this.apiKey = options.apiKey === undefined ? process.env.OPENAI_API_KEY : options.apiKey;
    this.model = options.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
    this.openai = options.openai || (this.apiKey ? new OpenAI({ apiKey: this.apiKey }) : null);
  }

  async generateReport({ client, imported, period, templateConfig }) {
    const normalizedTemplate = normalizeTemplateConfig(templateConfig);
    const headers = Array.isArray(imported.column_headers) ? imported.column_headers : [];
    const allRows = Array.isArray(imported.raw_data) ? imported.raw_data : [];
    const limitedRows = allRows.slice(0, MAX_AI_ROWS);

    const sections = {};
    for (const section of normalizedTemplate.sections) {
      sections[section.key] = await this.generateSection({
        client,
        imported,
        period,
        headers,
        rows: limitedRows,
        section,
      });
    }

    return {
      template_config: normalizedTemplate,
      sections,
      meta: {
        model: this.apiKey ? this.model : 'mock',
        used_mock: !this.apiKey,
        source_row_count: imported.row_count,
        ai_row_count: limitedRows.length,
      },
    };
  }

  async generateSection({ client, imported, period, headers, rows, section }) {
    if (!this.apiKey || !this.openai) {
      return {
        title: section.title,
        content: createMockSection(section, {
          clientName: client.name,
          period,
          rowCount: imported.row_count || rows.length,
        }),
        raw_response: {
          provider: 'mock',
          model: 'mock',
        },
      };
    }

    const prompt = buildSectionPrompt({
      clientName: client.name,
      period,
      headers,
      rows,
      section,
    });

    try {
      const response = await this.openai.responses.create({
        model: this.model,
        input: prompt,
      });

      const content = (response.output_text || '').trim();
      if (!content) {
        throw new ReportGenerationError(`OpenAI returned empty content for section ${section.key}`);
      }

      return {
        title: section.title,
        content,
        raw_response: response,
      };
    } catch (error) {
      const statusCode = error?.status === 401 ? 401 : error?.status === 429 ? 429 : 502;
      const message =
        statusCode === 401
          ? 'Invalid OpenAI API key'
          : statusCode === 429
            ? 'OpenAI rate limit exceeded'
            : error?.message || 'Failed to generate report section';
      throw new ReportGenerationError(message, statusCode);
    }
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_REPORT_TEMPLATE,
  MAX_AI_ROWS,
  ReportEngine,
  ReportGenerationError,
  normalizeTemplateConfig,
};
