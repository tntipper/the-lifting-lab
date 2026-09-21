// @ts-expect-error Deno requires the source extension; the Edge bundle resolves it.
import { createCustomerSubjectBrokerEdgeHandler, edgeEnvironment } from '../../../lib/identity/customer-subject-broker-edge.ts'

// Read secrets inside fetch. A module-load snapshot can stay empty on Edge,
// and the gate then returns 503 before OAuth bearer authentication.
const server = {
  fetch(request: Request) {
    return createCustomerSubjectBrokerEdgeHandler('userinfo', edgeEnvironment())(request)
  },
}
export default server
