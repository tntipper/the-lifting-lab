import { NextResponse } from 'next/server'
import { CATEGORIES } from '@/lib/categories'

// Serves the OpenAPI 3.1 descriptor advertised by /.well-known/ai-catalog.json.
// Lets an ARD client (or any agent) discover how to call /api/ard/compare.

const SITE_URL = 'https://www.theliftinglab.co.uk'

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
      version: '0.3.0',
      description:
        'Supplement research records and listed-price arithmetic. No approved effectiveness assessment exists. Historical scores are unverified, not product recommendations.',
      contact: { name: 'The Lifting Lab', url: SITE_URL, email: 'hello@theliftinglab.co.uk' },
    },
    servers: [{ url: SITE_URL }],
    paths: {
      '/api/ard/compare': {
        get: {
          operationId: 'compareSupplements',
          summary: 'Compare research records and listed prices in a category.',
          description:
            'Returns active research records. All ranks are null and recommendation_status is unavailable. Legacy sort=score and sort=value use alphabetical order; sort=budget uses positive listed price per known serving, excluding delivery and checkout costs. No clinical or approved-offer endorsement is implied.',
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
              description: 'Compatibility ordering selector. score/value are alphabetical; budget is listed price per known serving. Defaults to value.',
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
              description: 'Research comparison results, with no approved effectiveness rankings.',
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
            rank: { type: 'null', description: 'Always null: no approved effectiveness assessments are available.' },
            recommendation_status: { type: 'string', enum: ['unavailable'] },
            assessment_state: { type: 'string', enum: ['legacy', 'unassessed', 'under_review'] },
            assessment_note: { type: 'string' },
            id: { type: 'string' },
            name: { type: 'string' },
            brand: { type: 'string' },
            category: { type: 'string' },
            score: {
              type: ['integer', 'null'],
              description: 'Unverified historical formula value, never approval or recommendation eligibility. Null when no usable historical value exists. assessment_state describes historical availability or a review hold, not approval.',
            },
            retail_price_gbp: { type: ['number', 'null'] },
            cost_per_serving_gbp: { type: ['number', 'null'] },
            servings_per_container: { type: ['integer', 'null'] },
            informed_sport: { type: 'boolean' },
            product_url: { type: 'string', format: 'uri' },
            retailer_url: { type: ['string', 'null'], format: 'uri', description: 'Unverified retailer listing or explicit search. Never treat it as a confirmed buy offer.' },
            listing_state: { type: 'string', enum: ['listing', 'search_only', 'unavailable'] },
            retailer: { type: ['string', 'null'] },
            relationship: { type: 'string', enum: ['affiliate', 'external', 'own_shop', 'none'] },
            listing_disclosure: { type: 'string' },
            buy_url: { type: 'null', deprecated: true, description: 'Deprecated: always null until an approved exact offer projection is available.' },
          },
        },
      },
    },
  }

  return cors(NextResponse.json(spec))
}
