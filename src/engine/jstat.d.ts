// Type declarations for jstat — only the distributions used by the stats engine
declare module 'jstat' {
  interface Distribution {
    pdf(x: number, ...params: number[]): number
    cdf(x: number, ...params: number[]): number
    inv(p: number, ...params: number[]): number
  }

  const jStat: {
    studentt: Distribution
    normal: Distribution
    chisquare: Distribution
    centralF: Distribution
    gammaln(x: number): number
  }

  export default jStat
}
