/** TLL is not VAT registered: no output VAT deduction; supplier VAT remains a cash cost. */
export function signoffMargin(input: {
  pricePence: number; tradeCostExVatPence: number; supplierVatBps: number
  paymentFixedPence: number; paymentVariableBps: number
  deliveryCostPence: number; customerShippingPence: number
}) {
  for (const [key, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > (key.endsWith('Bps') ? 10000 : 1_000_000_000)) {
      throw new Error('Invalid margin input: ' + key)
    }
  }
  if (input.pricePence === 0) throw new Error('Price must be positive')
  const tradeCostPence = Math.round(input.tradeCostExVatPence * (10000 + input.supplierVatBps) / 10000)
  const receiptsPence = input.pricePence + input.customerShippingPence
  const paymentFeePence = input.paymentFixedPence + Math.round(receiptsPence * input.paymentVariableBps / 10000)
  const feesPence = paymentFeePence + input.deliveryCostPence
  const marginPence = receiptsPence - tradeCostPence - feesPence
  return { outputVatPence: 0, receiptsPence, tradeCostPence, paymentFeePence, feesPence, marginPence,
    marginRatio: marginPence / receiptsPence }
}
