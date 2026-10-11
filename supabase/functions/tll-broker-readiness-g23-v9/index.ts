// @ts-expect-error Deno requires the source extension; the Edge bundle resolves it.
import { brokerReadinessEnvironment, createStagingBrokerReadinessHandler } from '../../../lib/identity/staging-broker-readiness-edge.ts'

const server = {
  fetch(request: Request) {
    return createStagingBrokerReadinessHandler(brokerReadinessEnvironment())(request)
  },
}
export default server
