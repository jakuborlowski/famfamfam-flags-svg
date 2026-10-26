// famfamfam-flags-svg in React: `npm install famfamfam-flags-svg`, then
//   <Flag code="pl" name="Poland" />   a flag on its own, named by its alt
//   <Flag code="pl" name="" /> Poland  beside its name: decorative
// A mistyped code is a type error. A code from data needs narrowing first:
//   <Flag code={isFlagCode(order.country) ? order.country : "xx"} name="" />
import { flagUrl, type FlagCode } from "famfamfam-flags-svg";

export function Flag({ code, name }: { code: FlagCode | Uppercase<FlagCode>; name: string }) {
  return <img src={flagUrl(code)} height={11} alt={name} title={name || undefined} />;
}
