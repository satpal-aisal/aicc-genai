import styles from "./Feedback.module.css";
const Feedback = () => {
    return <div className={styles.feedbackWrapper}>
        
        <div className={styles.feedbackForm}>
            <iframe  style={{ width: "80%", height: "1000px", border:"0" }} src="https://forms.office.com/Pages/ResponsePage.aspx?id=YPtj3fYHlk2NQOvsphpSTnfGcYUWMQdIvfivJWcAYQRUM0FBUFMxMTBOQzlQUjlLRk9LREhCSEJQWS4u"></iframe>
        </div>

    </div>

}

export default Feedback;