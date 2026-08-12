import React from "react";
import { Link } from "react-router-dom";
import giglyIcon from "./assets/gigly-icon.png";
import appScreenshot from "./assets/app-screenshot.png";
import "./assets/homepage.css";

function AppleGlyph() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
            <path d="M16.365 1.43c0 1.14-.415 2.19-1.246 3.15-.998 1.14-2.206 1.8-3.516 1.69-.05-1.1.41-2.24 1.24-3.16.83-.93 2.26-1.6 3.44-1.68.02.13.02.27.02.4M20.6 17.24c-.5 1.15-.74 1.66-1.38 2.68-.9 1.43-2.16 3.21-3.73 3.22-1.39.02-1.75-.9-3.63-.89-1.88.01-2.27.9-3.66.89-1.57-.02-2.76-1.62-3.66-3.05-2.51-3.97-2.78-8.63-1.23-11.11.9-1.44 2.55-2.36 4.16-2.36 1.68 0 2.74.94 4.13.94 1.35 0 2.17-.94 4.13-.94 1.44 0 2.96.79 4.05 2.15-1.78 1-2.98 2.68-2.98 4.63 0 2.24 1.37 3.51 2.85 3.84z" />
        </svg>
    );
}

export default function HomePage() {
    return (
        <div className="splashShell">
            <div className="blob blobA" />
            <div className="blob blobB" />
            <div className="blob blobC" />

            <main className="splashContent">
                <div className="heroGrid">
                    <div className="heroText">
                        <div className="brandLockup">
                            <img src={giglyIcon} alt="" className="brandIcon" />
                            <span className="eyebrow">Gigly</span>
                        </div>

                        <div className="chipRow">
                            <span className="chip chipCoral" />
                            <span className="chip chipTeal" />
                            <span className="chip chipMustard" />
                            <span className="chip chipRose" />
                        </div>

                        <h1 className="headline">Find your next favorite hidden gem</h1>
                        <p className="subhero">
                            Tell us who you love. We'll find the artists playing live in the Bay
                            Area who sound like them, even the under-the-radar ones. Tickets are
                            one tap away.
                        </p>

                        <div
                            className="appStoreBtn"
                            role="button"
                            aria-disabled="true"
                            title="Coming soon"
                        >
                            <AppleGlyph />
                            <span className="appStoreBtnText" onClick={() => window.open("https://apps.apple.com/us/app/gigly-live-music-discovery/id6793709709", "_blank")}>
                                <span className="appStoreBtnSmall">Now available on the</span>
                                <span className="appStoreBtnBig">App Store</span>
                            </span>
                        </div>

                        <p className="ctaNote" style={{ marginTop: 20 }}>
                            Want to see your Spotify Prewrapped?{" "}
                            <Link to="/spotify-prewrapped" className="ctaNoteLink">
                                Click here
                            </Link>
                        </p>
                    </div>

                    <div className="heroPhoneWrap">
                        <div className="phoneGlow" />
                        <div className="phoneMockup">
                            <div className="phoneScreen">
                                <img src={appScreenshot} alt="Gigly app showing a matched artist with tickets" />
                            </div>
                            <div className="phoneSideButtonLeft1" />
                            <div className="phoneSideButtonLeft2" />
                            <div className="phoneSideButtonRight" />
                        </div>
                    </div>
                </div>
            </main>

            <footer className="splashFooter">
                <p>
                    Gigly — made for discovering live music. <Link to="/privacy-policy" className="footerLink">Privacy Policy</Link>
                </p>
            </footer>
        </div>
    );
}
