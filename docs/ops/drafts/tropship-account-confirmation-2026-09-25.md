# Draft email to Tropicana — not sent

**Superseded 5 October — do not send as a required next step.** The owner has supplied the original supplier reply, which confirms trade prices exclude VAT, and does not expect further clarification. Retain this old draft as history; continue using the supplied terms, manufacturer sources and the [completion plan](../stage-plans/2026-10-05-catalogue-to-launch-completion.md).

Updated 3 October after the newer CSV was found and compared against our catalogue. Not sent. The [reply review](../evidence/2026-09-30-owner-pasted-tropship-reply.md) records what is already answered.

To: `CS@tropicanawholesale.com`  
Subject: The Lifting Lab TropShip stock feed and remaining account questions

Hello Tropicana team,

Thank you for confirming the £5 plus VAT delivery charge on every TropShip order, the 20% rate for VAT-applicable products, the quantity stated in each product listing, the absence of RRPs, the hourly feed schedule and the sealed-goods return route. These answers have helped us prepare our shop.

We checked the SFTP folder again on 2 October and found `DropshipProductFeed.csv`, dated 2 October, alongside the XML file named in the setup guide. The CSV downloaded completely and contains 8,743 records. The XML is still dated 29 September and fails parsing at line 140915. The CSV has unescaped inch marks in 11 RDX belt names; strict CSV parsing first fails at line 2362. Could you confirm which file we should use going forward and correct these formatting issues? We have not submitted an order.

Could you also clarify these remaining points for **our TropShip account**? Brief answers by number are fine.

1. **Feed timing, duplicate records and availability.** Which file is updated hourly, and what time zone and actual stock observation time does it use? The CSV has 2,288 repeated-product-code groups. Within our catalogue, 24 matched codes repeat with agreeing checked details. What do these rows mean, and should we expect one row per sellable code? Ten of our matched variants show zero stock; we will keep their catalogue entries prepared for restocking. Does zero mean temporarily unavailable, and how are discontinued items distinguished? SKU REF152 is absent from the CSV although it was in our older feed: is it discontinued, renamed or temporarily omitted?
2. **Prices, VAT and charged units.** Does `ProductPrice` consistently mean our account's ex-VAT price? Does `Tax = VAT` mean 20% and `Tax = Zero` mean no VAT for the specific product as invoiced? Does XML `Size` always describe the exact quantity charged as one listed unit, including cartons, or are there exceptions? When do feed price changes take effect, and are there any handling, API or card fees in addition to product cost and the confirmed delivery charge? A redacted example invoice with a VAT-rated item, a zero-rated item and a multipack would help.
3. **Current product facts and conflicting options.** Are manufacturer label documents, ingredient and allergen sheets, or exact pack/barcode references available for TropShip items? Your reply explained that website imagery and details may lag behind a brand's changes. How are corrected product facts and pack changes communicated to account holders? We found these specific differences: OPT034 lists Size 896g but the feed name and current brand barcode option say 924g Chocolate Supreme; PER183 says 900g Cherry Bakewell in the feed but the same barcode appears on the brand’s 810g option; SYN031 says Vanilla in the feed but the same barcode appears on the brand’s Cookies & Cream option; OPT296 says 775g while the current brand family lists 780g. Please confirm the exact currently supplied pack, flavour and barcode for each. REF152 has no current official product page or feed match. Current UK labels for these and the rest of our launch range would help us complete the checks.
4. **Delivery and returns exceptions.** Are any mainland UK postcodes excluded or surcharged? Can split parcels, failed delivery or redelivery add charges? After a sealed standard return is logged within 14 days of purchase, what is the required period for the goods to reach you? Does the £5 plus VAT DPD Pickup Shop fee apply to faulty or damaged products, and what costs or refund options apply to a parcel returned after failed delivery or an order that cannot be cancelled once processing starts?
5. **Order API and stock at submission.** Is there a stock and price check when an order is submitted, and what happens if the feed changed after download? Is there a test environment? Which response definitively confirms an order, and can we query or reconcile it by our unique reference after a timeout without risking a duplicate? How and when are rejection, dispatch and tracking updates sent?

We are requesting information only. **Please do not place an order.**

Kind regards,
The Lifting Lab
