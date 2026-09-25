# Draft email to Tropicana — not sent

To: `CS@tropicanawholesale.com`  
Subject: The Lifting Lab TropShip account — product data, prices and fulfilment terms

Hello Tropicana team,

Thank you for your TropShip welcome email of 14 September. We are preparing The Lifting Lab's first range around TropShip products. We have reviewed the product listings, delivery/returns pages and TropShip API documentation available in our signed-in account. Could you please clarify the remaining points **for our TropShip account**, rather than the separate wholesale account? Brief answers by number are fine.

1. **TropShip delivery charge.** Your welcome email says £5 plus VAT per TropShip order, while the general delivery page mentions free delivery above £100. Please confirm that the £100 threshold applies only to our wholesale account and that £5 plus VAT applies to every TropShip order, regardless of value. Is the fee per submitted order, parcel or address? Which mainland UK postcodes are excluded or surcharged, and can split parcels, failed delivery or redelivery create extra charges?
2. **Feed prices, VAT and charged units.** On the signed-in `APP449` page, £7.45 + VAT becomes £8.94 inclusive, and the feed also shows £7.45. Does `ProductPrice` consistently mean our account's **ex-VAT** TropShip price for every SKU? Does `Tax = VAT` consistently mean 20% and `Tax = Zero` 0%, subject to a current product-level rate? Does the price buy one exact `Size` unit, including cartons such as `12x55g`? When do feed price changes take effect, and are there other minimums or handling/API/card fees?
3. **Recommended retail price.** Can you provide a current manufacturer RRP or recommended selling price for each SKU, ideally as a feed column? Is that RRP VAT-inclusive and for the exact same pack/flavour as the wholesale item? If RRP is unavailable or only indicative, please say so; we will calculate our own retail prices rather than assume a figure.
4. **Accuracy and use of product information.** Your product pages already show barcodes, nutrition and images. Are those details checked against the current manufacturer label for the exact flavour and pack, and how are corrections or formulation changes communicated? Some feed nutrition text appears to name a different flavour or product form. If manufacturer label documents or links are available, where can we obtain them? May we display the product images supplied on your site or feed on our own site? We will write our own descriptions.
5. **Stock feed.** What is the actual feed update cadence and timestamp/time zone? How are discontinued or temporarily unavailable TropShip items represented? Is there a stock/price check at order submission, and how should we handle a sale if stock changes between feed download and order acceptance?
6. **Order API and exceptions.** We have the signed-in Swagger documentation and know `validate_only=true` avoids order submission and payment. Is there a test environment? Which response definitively confirms acceptance, and can we query, cancel and reconcile by our unique reference? How should a timed-out submission be checked without accidentally creating a duplicate? How and when are dispatch, rejection and tracking updates sent?
7. **TropShip-specific returns.** Your general returns page describes a supplier return route and prompt reports for damage or missing goods. Does that process apply unchanged to TropShip orders shipped to our customers? Please confirm cancellation, return-label, return-address, failed-delivery, credit and refund handling and any charges or exceptions for sealed supplements.

Please send current account-specific written terms and, if possible, a redacted invoice example showing one VAT-rated product, one zero-rated product, delivery VAT and the charged sellable unit. We are requesting information only; **please do not place an order**.

Kind regards,
The Lifting Lab
