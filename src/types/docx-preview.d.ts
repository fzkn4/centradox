declare module 'docx-preview' {
  export function renderAsync(
    data: Blob | ArrayBuffer | Uint8Array,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement,
    options?: {
      className?: string;
      inWrapper?: boolean;
      ignoreWidth?: boolean;
      ignoreHeight?: boolean;
      ignoreFonts?: boolean;
      breakPages?: boolean;
      ignoreLastRenderedPageBreak?: boolean;
      experimental?: boolean;
      trimXmlDeclaration?: boolean;
      useBase64URL?: boolean;
      useMathMLPolyfill?: boolean;
      showChanges?: boolean;
      debug?: boolean;
    }
  ): Promise<any>;
}
