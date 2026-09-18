// @ts-expect-error Deno requires the source extension; the Edge bundle resolves it.
import { createCustomerSubjectBrokerEdgeHandler, edgeEnvironment } from '../../../lib/identity/customer-subject-broker-edge.ts'

const handler = createCustomerSubjectBrokerEdgeHandler('userinfo', edgeEnvironment())
const server = { fetch: handler }
export default server
