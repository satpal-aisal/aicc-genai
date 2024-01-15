import { Outlet, NavLink, Link } from "react-router-dom";

import github from "../../assets/github.svg";

import styles from "./Layout.module.css";

const Layout = () => {
    return (
        <div className={styles.layout}>
            <header className={styles.header} role={"banner"}>
                <div className={styles.headerContainer}>
                    <Link to="/" className={styles.headerTitleContainer}>
                        <h3 className={styles.headerTitle}>JSPL Gen AI</h3>
                        
                    </Link>
                    <nav>
                        <ul className={styles.headerNavList}>
                            {/* <li>
                                <NavLink to="/" className={({ isActive }) => (isActive ? styles.headerNavPageLinkActive : styles.headerNavPageLink)}>
                                    Chat
                                </NavLink>
                            </li> */}
                            {/* <li className={styles.headerNavLeftMargin}>
                                <NavLink to="/feedback" className={({ isActive }) => (isActive ? styles.headerNavPageLinkActive : styles.headerNavPageLink)}>
                                    Submit Feedback
                                </NavLink>
                            </li> */}
                            {/* <li className={styles.headerNavLeftMargin}>
                                <NavLink to="/qa" className={({ isActive }) => (isActive ? styles.headerNavPageLinkActive : styles.headerNavPageLink)}>
                                    Ask a question
                                </NavLink>
                            </li> */}
                            {/* <li className={styles.headerNavLeftMargin}>
                                <a href="https://aka.ms/entgptsearch" target={"_blank"} title="Github repository link">
                                    <img
                                        src={github}
                                        alt="Github logo"
                                        aria-label="Link to github repository"
                                        width="20px"
                                        height="20px"
                                        className={styles.githubLogo}
                                    />
                                </a>
                            </li> */}
                        </ul>
                    </nav>
                    {/* <h4 className={styles.headerRightText}>Azure OpenAI + Cognitive Search</h4> */}
                </div>
            </header>
            <Outlet />
            {/* <footer className={styles.footer}>
                <b>Disclaimer: </b>
                This OEPS ChatGPT Search application is being evaluated as a future OEPS Search solution. 
                The software should be considered in “beta test”, and its performance is limited to certain restrictions on the number of concurrent users and resource availability of Azure OpenAI resources. Search Results provided should be scrutinized to ensure that the answers provided are “correct” and not misleading or inappropriate in relation to the context of the question
                <a style={{marginLeft:"10px"}} href="https://forms.office.com/Pages/ResponsePage.aspx?id=YPtj3fYHlk2NQOvsphpSTnfGcYUWMQdIvfivJWcAYQRUM0FBUFMxMTBOQzlQUjlLRk9LREhCSEJQWS4u" target="_blank">Submit Feedback</a>
            </footer> */}
        </div>
    );
};

export default Layout;
