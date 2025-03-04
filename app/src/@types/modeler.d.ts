class DCRModeler {
    constructor(options: any): void;

    destroy(): void;

    importXML(xml: string): Promise<void>;
    importCustomXML(xml: string): Promise<void>;
    importDCRPortalXML(xml: string): Promise<void>;

    saveXML({ format: boolean }): Promise<{ xml: string }>;
    saveDCRXML(): Promise<{ xml: string }>
    saveSVG(): Promise<{ svg: string }>
}


declare module "modeler" {
    export default DCRModeler;
}