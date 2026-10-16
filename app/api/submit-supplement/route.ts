import { handlePublicSubmission } from '@/lib/submissions/gateway'

export const runtime = 'nodejs'
export async function POST(req: Request) { return handlePublicSubmission(req, 'supplement') }
