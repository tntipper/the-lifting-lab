export const PRIVATE_PATHS = ['/account', '/dashboard', '/auth', '/api/', '/admin', '/preview', '/cart', '/favourites']
export const AGENT_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended']
export function noIndexDeployment() {
  return !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'
}
