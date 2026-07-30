import React from "react";
import { Link } from "react-router-dom";
import giglyIcon from "./assets/gigly-icon.png";
import "./assets/privacy.css";

export default function PrivacyPolicyPage() {
    return (
        <div className="privacyShell">
            <div className="privacyTopBar">
                <Link to="/" className="privacyBackLink">
                    &larr; Back to Gigly
                </Link>
                <div className="privacyBrand">
                    <img src={giglyIcon} alt="" className="privacyBrandIcon" />
                    <span className="privacyBrandText">Gigly</span>
                </div>
            </div>

            <div className="privacyContent">
                <span className="privacyEyebrow">Legal</span>
                <h1 className="privacyHeadline">Privacy Policy</h1>
                <p className="privacyUpdated">Last updated: July 30, 2026</p>

                <p className="privacyIntro">
                    Gigly ("Gigly," "we," "us," or "our") helps you discover live music in the Bay
                    Area that matches your taste. This policy explains what information we collect
                    when you use the Gigly app or website, how we use it, and the choices you have.
                    By using Gigly, you agree to the practices described here.
                </p>

                <div className="privacySection">
                    <h2>Information We Collect</h2>

                    <h3>Information you provide directly</h3>
                    <p>
                        If you search for or add artists manually, we process the artist names you
                        enter in order to find similar artists and upcoming shows. We don't require
                        you to create a Gigly account or provide a name, email, or password to use
                        the core app.
                    </p>

                    <h3>Information from Spotify</h3>
                    <p>
                        If you choose to connect your Spotify account, Gigly requests access to a
                        limited set of your Spotify data through Spotify's official login (OAuth).
                        Depending on which features you use, this can include:
                    </p>
                    <ul>
                        <li>Your top artists and tracks, and the genres associated with them</li>
                        <li>Your Spotify display name and profile image</li>
                        <li>Counts of your liked songs, saved albums, followed artists, and playlists</li>
                        <li>Your recently played tracks</li>
                        <li>Podcast shows you follow on Spotify</li>
                        <li>The ability to create a new playlist on your Spotify account, only when you explicitly choose to save a lineup</li>
                    </ul>
                    <p>
                        We store your Spotify access credentials securely on our servers so we can
                        make these requests on your behalf while you're using Gigly. We do not
                        receive your Spotify password.
                    </p>

                    <h3>Automatically collected information</h3>
                    <p>
                        Like most apps and websites, our servers automatically log standard technical
                        information when you use Gigly, such as IP address, device/browser type, and
                        request timestamps. We use this only for security, debugging, and keeping the
                        service running — not for advertising or tracking you across other apps or
                        websites.
                    </p>
                </div>

                <div className="privacySection">
                    <h2>How We Use Your Information</h2>
                    <ul>
                        <li>To match you with artists and live shows that fit your taste</li>
                        <li>To let you preview tracks, see show details, and find tickets</li>
                        <li>To create a Spotify playlist on your behalf, only when you ask us to</li>
                        <li>To keep your session signed in while you use the app</li>
                        <li>To maintain, secure, and improve Gigly</li>
                    </ul>
                    <p>We do not sell your personal information, and we do not use it for advertising.</p>
                </div>

                <div className="privacySection">
                    <h2>Third-Party Services</h2>
                    <p>Gigly relies on a small number of third-party services to work:</p>
                    <ul>
                        <li>
                            <strong>Spotify</strong> — for login and the listening data described above. Spotify's
                            own privacy practices apply to how they handle your account; see{" "}
                            <a href="https://www.spotify.com/legal/privacy-policy/" target="_blank" rel="noreferrer">
                                Spotify's Privacy Policy
                            </a>.
                        </li>
                        <li>
                            <strong>Anthropic (Claude)</strong> — we send the artist names you're interested in to
                            Anthropic's Claude AI to help find musically similar artists. We do not send your
                            Spotify account details, personal identifiers, or listening history to Anthropic.
                        </li>
                        <li>
                            <strong>Apple's iTunes Search API</strong> — used to fetch short preview clips for
                            artists, using only artist/track names.
                        </li>
                        <li>
                            <strong>Google Cloud Platform / Firebase</strong> — we host Gigly and store the data
                            described in this policy on Google's infrastructure.
                        </li>
                    </ul>
                </div>

                <div className="privacySection">
                    <h2>Cookies and Local Storage</h2>
                    <p>
                        On the Gigly website, we use a small, necessary cookie to keep you signed in
                        during your Spotify session, and a short-lived cookie during the login process
                        itself. On the Gigly mobile app, your session is stored securely on your device
                        instead of in a cookie. None of these are used for advertising or cross-site
                        tracking.
                    </p>
                </div>

                <div className="privacySection">
                    <h2>Data Retention and Deletion</h2>
                    <p>
                        We keep your Spotify session and associated data for as long as your account
                        stays connected, so Gigly can keep working without asking you to reconnect
                        constantly. Disconnecting Spotify in the app stops Gigly from making further
                        requests on your behalf. To request full deletion of any data we hold about
                        you, contact us using the details below and we'll take care of it.
                    </p>
                </div>

                <div className="privacySection">
                    <h2>Children's Privacy</h2>
                    <p>
                        Gigly is not directed at children under 13, and we don't knowingly collect
                        information from children under 13. If you believe a child has provided us
                        with personal information, please contact us and we'll remove it.
                    </p>
                </div>

                <div className="privacySection">
                    <h2>Changes to This Policy</h2>
                    <p>
                        We may update this policy as Gigly evolves. If we make material changes,
                        we'll update the "Last updated" date above. Continuing to use Gigly after
                        changes take effect means you accept the updated policy.
                    </p>
                </div>

                <div className="privacySection">
                    <h2>Contact Us</h2>
                    <p>
                        Questions about this policy or your data? Reach us at{" "}
                        <a href="mailto:privacy@giglymusic.com">privacy@giglymusic.com</a>.
                    </p>
                </div>

                <div className="privacyFooter">
                    <Link to="/" className="privacyBackLink">
                        &larr; Back to Gigly
                    </Link>
                </div>
            </div>
        </div>
    );
}
