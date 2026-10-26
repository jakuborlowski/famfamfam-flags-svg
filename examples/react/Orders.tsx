// A page using <Flag>: country codes as data holds them, and names in the
// user's language from the platform rather than from a translation table.
import { flags, isFlagCode } from "famfamfam-flags-svg";
import { Flag } from "./Flag";

export type Order = { id: number; country: string };

export function Orders({ orders, lang }: { orders: Order[]; lang: string }) {
  // Intl names two-letter ISO codes (it throws on others); the package's
  // English names cover the rest, and a code without a flag stays as it is.
  const regions = new Intl.DisplayNames([lang], { type: "region", fallback: "none" });
  const name = (code: string) =>
    (/^[a-z]{2}$/i.test(code) && regions.of(code.toUpperCase())) || flags[code.toLowerCase()]?.name || code;
  return (
    <main>
      <h1>Orders</h1>
      <p>
        Shipping to{" "}
        {orders.map((order) => (
          <Flag key={order.id} code={isFlagCode(order.country) ? order.country : "xx"} name={name(order.country)} />
        ))}
      </p>
      <table>
        <thead>
          <tr><th scope="col">Order</th><th scope="col">Country</th></tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td><Flag code={isFlagCode(order.country) ? order.country : "xx"} name="" /> {name(order.country)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
