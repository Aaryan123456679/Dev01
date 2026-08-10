declare module 'mammoth/mammoth.browser' {
  interface ExtractResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>
}
