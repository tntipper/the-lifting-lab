# Draft email to Tropicana — not sent

Updated after the owner's pasted TropShip reply on 30 September. The original email date was not supplied. The [reply review](../evidence/2026-09-30-owner-pasted-tropship-reply.md) records what is now answered.

To: `CS@tropicanawholesale.com`  
Subject: The Lifting Lab TropShip stock feed and remaining account questions

Hello Tropicana team,

Thank you for confirming the £5 plus VAT delivery charge on every TropShip order, the 20% rate for VAT-applicable products, the quantity stated in each product listing, the absence of RRPs, the hourly feed schedule and the sealed-goods return route. These answers have helped us prepare our shop.

We downloaded `DropshipProductFeed.xml` by SFTP on 30 September. The server listed the 7,950,965-byte file as last modified on 29 September at 11:10, without a stated time zone. The downloaded file fails strict XML parsing at line 140915: a closing `Products` tag is followed by more product fields and records. Could you republish a complete, valid file and confirm its actual stock observation and update time? We can provide the file SHA-256 and structural location if useful. We have not submitted an order.

Could you also clarify these remaining points for **our TropShip account**? Brief answers by number are fine.

1. **Feed timing and duplicate records.** Why did this file appear to be from the previous day if it updates hourly, and which time zone does the file listing or feed use? Some product codes occur twice with identical details in the readable portion. What do those rows mean, and should we expect one row per sellable product code in the corrected file? How are discontinued or temporarily unavailable items represented?
2. **Prices, VAT and charged units.** Does `ProductPrice` consistently mean our account's ex-VAT price? Does `Tax = VAT` mean 20% and `Tax = Zero` mean no VAT for the specific product as invoiced? Does XML `Size` always describe the exact quantity charged as one listed unit, including cartons, or are there exceptions? When do feed price changes take effect, and are there any handling, API or card fees in addition to product cost and the confirmed delivery charge? A redacted example invoice with a VAT-rated item, a zero-rated item and a multipack would help.
3. **Current product facts.** Are manufacturer label documents, ingredient and allergen sheets, or exact pack/barcode references available for TropShip items? Your reply explained that website imagery and details may lag behind a brand's changes. How are corrected product facts and pack changes communicated to account holders?
4. **Delivery and returns exceptions.** Are any mainland UK postcodes excluded or surcharged? Can split parcels, failed delivery or redelivery add charges? After a sealed standard return is logged within 14 days of purchase, what is the required period for the goods to reach you? Does the £5 plus VAT DPD Pickup Shop fee apply to faulty or damaged products, and what costs or refund options apply to a parcel returned after failed delivery or an order that cannot be cancelled once processing starts?
5. **Order API and stock at submission.** Is there a stock and price check when an order is submitted, and what happens if the feed changed after download? Is there a test environment? Which response definitively confirms an order, and can we query or reconcile it by our unique reference after a timeout without risking a duplicate? How and when are rejection, dispatch and tracking updates sent?

We are requesting information only. **Please do not place an order.**

Kind regards,
The Lifting Lab
