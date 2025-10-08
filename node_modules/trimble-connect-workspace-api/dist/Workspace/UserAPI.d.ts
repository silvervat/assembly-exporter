/**
 * The data structure representing a Trimble Connect user.
 */
export interface ConnectUser {
    /** The user identifier */
    id: string;
    /** The user's first name */
    firstName?: string;
    /** The user's last name */
    lastName?: string;
    /** The user's email address */
    email?: string;
    /** The language settings */
    language?: string;
}
/**
 * The enum structure representing the accepted background color values.
 */
export declare type BackgroundColor = "White" | "LightGray" | "Default" | "Gray1" | "Gray2" | "Gray3" | "GrayDark2";
/**
 * The data structure representing the user settings.
 */
export interface UserSettings {
    /** The background color settings */
    backgroundColor: BackgroundColor;
    /** The language settings */
    language: string;
}
/**
 * The API for operations related to Trimble Connect users.
 */
export interface UserAPI {
    /** Gets the current Trimble Connect user asynchronously.
     * @returns The awaitable task that returns the current Trimble Connect user.
     */
    getUser(): Promise<ConnectUser>;
    /** Gets the current user settings asynchronously.
     * @returns The awaitable task that returns the current user settings.
     */
    getSettings(): Promise<UserSettings>;
    /** Gets the current user settings asynchronously from the Trimble connect project extension.
     * @deprecated Use {@link UserAPI.getUser} instead.
     * @returns The awaitable task that returns the current user settings.
     */
    getUserSettings(): Promise<ConnectUser>;
}
