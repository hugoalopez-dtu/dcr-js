export const models = [
    {"label": "GPT 5.4 mini", "id": "gpt-5.4-mini-2026-03-17"},
    {"label": "GPT 5.5", "id": "gpt-5.5-2026-04-23"},
    {"label": "GPT 5.4", "id": "gpt-5.4-2026-03-05"},
];

export const examples = [
    {id: "261/2004 (13)", text: "(13) Passengers whose flights are cancelled should be able either to obtain reimbursement of their tickets or to obtain re-routing under satisfactory conditions, and should be adequately cared for while awaiting a later flight."},
    {id: "261/2004 (10)", text: "(10) Passengers denied boarding against their will should be able either to cancel their flights, with reimbursement of their tickets, or to continue them under satisfactory conditions, and should be adequately cared for while awaiting a later flight."},
    {id: "261/2004 (12)", text: "(12) The trouble and inconvenience to passengers caused by cancellation of flights should also be reduced. This should be achieved by inducing carriers to inform passengers of cancellations before the scheduled time of departure and in addition to offer them reasonable re-routing, so that the passengers can make other arrangements. Air carriers should compensate passengers if they fail to do this, except when the cancellation occurs in extraordinary circumstances which could not have been avoided even if all reasonable measures had been taken."},
    {id: "261/2004 Article 5", text: `Article 5

Cancellation

1. In case of cancellation of a flight, the passengers concerned shall:

(a) be offered assistance by the operating air carrier in accordance with Article 8; and

(b) be offered assistance by the operating air carrier in accordance with Article 9(1)(a) and 9(2), as well as, in event of re-routing when the reasonably expected time of departure of the new flight is at least the day after the departure as it was planned for the cancelled flight, the assistance specified in Article 9(1)(b) and 9(1)(c); and

(c) have the right to compensation by the operating air carrier in accordance with Article 7, unless:

(i) they are informed of the cancellation at least two weeks before the scheduled time of departure; or

(ii) they are informed of the cancellation between two weeks and seven days before the scheduled time of departure and are offered re-routing, allowing them to depart no more than two hours before the scheduled time of departure and to reach their final destination less than four hours after the scheduled time of arrival; or

(iii) they are informed of the cancellation less than seven days before the scheduled time of departure and are offered re-routing, allowing them to depart no more than one hour before the scheduled time of departure and to reach their final destination less than two hours after the scheduled time of arrival.

2. When passengers are informed of the cancellation, an explanation shall be given concerning possible alternative transport.

3. An operating air carrier shall not be obliged to pay compensation in accordance with Article 7, if it can prove that the cancellation is caused by extraordinary circumstances which could not have been avoided even if all reasonable measures had been taken.

4. The burden of proof concerning the questions as to whether and when the passenger has been informed of the cancellation of the flight shall rest with the operating air carrier.`},

{id: "Restaurant Service (Imperative)", text: 'The process starts with the client arriving at the restaurant. Once the client has arrived, the waitstaff must sit the customer and give him the menu. The waiter can’t place the food order before the customer knows what to eat. If the food is ready the waitstaff can serve the food. When the meal is served, the waiter must stand by the customer to finish his dish. After finishing it, the customer can order more food or can ask for the bill. Once the bill has been requested, the waiter must bring it. The customer can’t leave the restaurant without paying either with cash or card. After the payment process the waiter must give the client his receipt. Finally, the client can leave and the waiter is free to take another incoming customer, as well as the client is capable to re-enter the restaurant.'},

{id: "Restaurant Service (Declarative)", text: 'In the ordering-food process, initially, food will be ordered by the customer and eventually will be delivered to complete the order process. After ordering food the customer must pay for the food. If the payment fails the customer must place a new order. The order cannot be completed if payment fails. After successful payment the restaurant must process the order. The restaurant must then prepare the food. If the restaurant does not prepare the food the customer will be refunded and should place a new order. When the food has been prepared, the delivery driver should pick up and deliver the food. If the delivery driver does not deliver the food, the customer will be refunded and should place a new order. When the food has been successfully delivered the process ends.'},
];
