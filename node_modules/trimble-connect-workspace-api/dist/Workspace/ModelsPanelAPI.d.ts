/** The models panel visualisation mode. */
export declare type ModelsPanelMode = "all" | "selected";
/**
 * The data structure representing a Trimble Connect models panel configuration.
 */
export interface ModelsPanelConfig {
    /** Mode: all | selected  */
    mode?: ModelsPanelMode;
}
/**
 * The API for operations related to Trimble Connect users.
 */
export interface ModelsPanelAPI {
    /** Gets the current Models Panel config asynchronously.
     * @returns The awaitable task that returns the current Models Panel config
     */
    getConfig(): Promise<ModelsPanelConfig>;
    /** Sets the Models Panel config
     * @param config - new config to be updated to Models Panel
     */
    setConfig(config: ModelsPanelConfig): Promise<void>;
}
