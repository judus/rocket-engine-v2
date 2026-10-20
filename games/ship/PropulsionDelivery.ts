/** Independent propulsion channels within one module's already allocated power budget.
 * Pay baseline once, then rotation before translation so thrust cannot dilute steering.
 * Aggregate fractions describe telemetry only; forces use their own channel fractions.
 */
export function propulsionDelivery(
  suppliedW: number,
  baselineW: number,
  translationDemandW: number,
  rotationDemandW: number,
  operating: boolean,
  outputFraction: number,
) {
  const baselineSuppliedW = Math.min(baselineW, suppliedW);
  const availableW =
    operating && baselineSuppliedW >= baselineW
      ? Math.max(0, suppliedW - baselineW)
      : 0;
  const rotationSuppliedW = Math.min(rotationDemandW, availableW);
  const translationSuppliedW = Math.min(
    translationDemandW,
    availableW - rotationSuppliedW,
  );
  const funded = operating && baselineSuppliedW >= baselineW;
  const fraction = (supply: number, demand: number) =>
    funded ? (demand > 0 ? Math.min(1, supply / demand) : 1) : 0;
  const powerFraction = fraction(
    rotationSuppliedW + translationSuppliedW,
    rotationDemandW + translationDemandW,
  );
  const translationPowerFraction = fraction(
    translationSuppliedW,
    translationDemandW,
  );
  const rotationPowerFraction = fraction(rotationSuppliedW, rotationDemandW);
  return Object.freeze({
    baselineSuppliedW,
    translationDemandW,
    rotationDemandW,
    translationSuppliedW,
    rotationSuppliedW,
    translationPowerFraction,
    rotationPowerFraction,
    translationActivityFraction: translationPowerFraction * outputFraction,
    rotationActivityFraction: rotationPowerFraction * outputFraction,
    powerFraction,
    activityFraction: powerFraction * outputFraction,
  });
}
export type PropulsionDelivery = ReturnType<typeof propulsionDelivery>;
