import { NextResponse } from 'next/server'
import { CATEGORIES } from '@/lib/categories'

// Serves the OpenAPI 3.1 descriptor advertised by /.well-known/ai-catalog.json.
// Lets an ARD client (or any agent) discover how to call /api/ard/compare.

const SITE_URL = 'https://theliftinglab.co.uk'

function cors<T extends Response>(res: T): T {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'The Lifting Lab — Supplement Value Comparison',
      version: '0.1.0',
      description:
        'Independent comparison and ranking of sports-nutrition and supplement products by ingredient dosing, serving size and price-per-serving value. Scores reflect what is in a product and what it costs — not brand marketing.',
      contact: { name: 'The Lifting Lab', url: SITE_URL, email: 'hello@theliftinglab.co.uk' },
    },
    servers: [{ url: SITE_URL }],
    paths: {
      '/api/ard/compare': {
        get: {
          operationId: 'compareSupplements',
          summary: 'Rank supplements in a category by value, price or quality score.',
          description:
            'Returns a ranked list of active products in the given category. Use sort=value for best dose-for-money, sort=budget for cheapest per serving, sort=score for highest quality.',
          parameters: [
            {
              name: 'category',
              in: 'query',
              required: true,
              description: 'Supplement category slug.',
              schema: { type: 'string', enum: CATEGORIES.map((c) => c.slug) },
            },
            {
              name: 'sort',
              in: 'query',
              required: false,
              description: 'Ranking strategy. Defaults to value.',
              schema: { type: 'string', enum: ['value', 'budget', 'score'], default: 'value' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Max results (1-20). Defaults to 5.',
              schema: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
            },
          ],
          responses: {
            '200': {
              description: 'Ranked comparison results.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CompareResponse' },
                },
              },
            },
            '400': { description: 'Unknown or missing category.' },
          },
        },
      },
    },
    components: {
      schemas: {
        CompareResponse: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            sort: { type: 'string' },
            count: { type: 'integer' },
            methodology: { type: 'string', format: 'uri' },
            disclosure: { type: 'string' },
            results: { type: 'array', items: { $ref: '#/components/schemas/RankedProduct' } },
          },
        },
        RankedProduct: {
          type: 'object',
          properties: {
            rank: { type: 'integer' },
            id: { type: 'string' },
            name: { type: 'string' },
            brand: { type: 'string' },
            category: { type: 'string' },
            score: {
              type: ['integer', 'null'],
              description: 'Lifting Lab clinical score 0-100 (higher is better; null if not yet scored).',
            },
            retail_price_gbp: { type: ['number', 'null'] },
            cost_per_serving_gbp: { type: ['number', 'null'] },
            servings_per_container: { type: ['integer', 'null'] },
            informed_sport: { type: 'boolean' },
            product_url: { type: 'string', format: 'uri' },
            buy_url: { type: 'string', format: 'uri', description: 'Affiliate buy link.' },
          },
        },
      },
    },
  }

  return cors(NextResponse.json(spec))
}
