declare module 'plotly.js-dist-min' {
  const Plotly: {
    newPlot(el: HTMLElement, data: any[], layout?: any, config?: any): Promise<any>
    purge(el: HTMLElement): void
    Plots: {
      resize(el: HTMLElement): void
    }
  }
  export default Plotly
  export = Plotly
}
