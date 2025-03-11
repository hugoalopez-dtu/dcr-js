class DCRModeler {
    constructor(options: any): void;

    destroy(): void;

    importXML(xml: string): Promise<void>;
    importCustomXML(xml: string): Promise<void>;
    importDCRPortalXML(xml: string): Promise<void>;

    saveXML(options: { format: boolean }): Promise<{ xml: string }>;
    saveDCRXML(): Promise<{ xml: string }>
    saveSVG(): Promise<{ svg: string }>

    setSetting(key: SettingsKey, value: SettingsVal): void;

    on(channel: string, callback: (event: any) => void);
    off(channel: string, callback: (event: any) => void);

    getElementRegistry(): any;
    getSelection(): any;

    updateRendering(graph: DCRGraph): void;
    setSimulating(val: boolean): void;
}


declare module "modeler" {
    export default DCRModeler;
}