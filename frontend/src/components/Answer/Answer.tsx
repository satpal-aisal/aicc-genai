import { useMemo, useRef, useState } from "react";
import { Stack, IconButton } from "@fluentui/react";
import DOMPurify from "dompurify";

import styles from "./Answer.module.css";

import { AskResponse, getCitationFilePath } from "../../api";
import { parseAnswerToHtml } from "./AnswerParser";
import { ThumbDislike20Filled, ThumbDislike20Regular, ThumbLike20Filled, ThumbLike20Regular } from "@fluentui/react-icons";
import { IContextualMenuProps } from '@fluentui/react/lib/ContextualMenu';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { useConst } from '@fluentui/react-hooks';

interface Props {
    answer: AskResponse;
    isSelected?: boolean;
    onCitationClicked: (filePath: string) => void;
    onThoughtProcessClicked: () => void;
    onSupportingContentClicked: () => void;
    onLikeDislikeClicked: (val: number) => void;
    onFollowupQuestionClicked?: (question: string) => void;
    showFollowupQuestions?: boolean;
}

export const Answer = ({
    answer,
    isSelected,
    onCitationClicked,
    onThoughtProcessClicked,
    onSupportingContentClicked,
    onFollowupQuestionClicked,
    onLikeDislikeClicked,
    showFollowupQuestions
}: Props) => {
    const selectedCitation = useRef<any>(null);
    // const [selectedCitation, setSelectedCitation] = useState<any>(null);
    const parsedAnswer = useMemo(() => parseAnswerToHtml(answer.answer, onCitationClicked), [answer]);
    const menuProps = useConst<IContextualMenuProps>(() => ({
        shouldFocusOnMount: true,
        shouldFocusOnContainer: true,
        items: [
            {
                key: 'Open Page', text: 'Open Page', onClick: () => {
                    if(selectedCitation.current){
                        const page = getCitationFilePath(selectedCitation.current[0])
                        onCitationClicked(page)
                    }
                }
            },
            {
                key: 'Open File', text: 'Open File', onClick: () => {
                    if(selectedCitation.current){
                        window.open(selectedCitation.current[1], "__blank")
                    }
                }
            },
        ],
    }));
    const sanitizedAnswerHtml = DOMPurify.sanitize(parsedAnswer.answerHtml);
    const citationClick = () => {
        console.log("citationClick")
    }
    return (
        <Stack className={`${styles.answerContainer} ${isSelected && styles.selected}`} verticalAlign="space-between">
            <Stack.Item>
                <Stack horizontal horizontalAlign="space-between">
                    {/* <AnswerIcon /> */}
                    <img src="wft-icon.png" alt="logo" style={{ height: "20px" }} />
                    <div>
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: "Lightbulb" }}
                            title="Show thought process"
                            ariaLabel="Show thought process"
                            onClick={() => onThoughtProcessClicked()}
                            disabled={!answer.thoughts}
                        />
                        <IconButton
                            style={{ color: "black" }}
                            iconProps={{ iconName: "ClipboardList" }}
                            title="Show supporting content"
                            ariaLabel="Show supporting content"
                            onClick={() => onSupportingContentClicked()}
                            disabled={!answer.data_points.length}
                        />


                        {
                            answer.isLike === 0 ? <>
                                <IconButton style={{ color: "black" }} onClick={() => onLikeDislikeClicked(1)} title="Like">
                                    <ThumbLike20Regular />
                                </IconButton>
                                <IconButton style={{ color: "black" }} onClick={() => onLikeDislikeClicked(-1)} title="Dislike">
                                    <ThumbDislike20Regular />
                                </IconButton>
                            </> : ""
                        }
                        {
                            answer.isLike === 1 ?
                                <>
                                    <IconButton style={{ color: "black" }}>
                                        <ThumbLike20Filled />
                                    </IconButton>
                                    <IconButton style={{ color: "black" }} onClick={() => onLikeDislikeClicked(-1)} title="dislike">
                                        <ThumbDislike20Regular />
                                    </IconButton>
                                </>
                                : ""
                        }
                        {
                            answer.isLike === -1 ? <>
                                <IconButton style={{ color: "black" }} onClick={() => onLikeDislikeClicked(1)} >
                                    <ThumbLike20Regular title="Like" />
                                </IconButton>
                                <IconButton style={{ color: "black" }}>
                                    <ThumbDislike20Filled />
                                </IconButton>
                            </> : ""
                        }
                    </div>
                </Stack>
            </Stack.Item>

            <Stack.Item grow>
                <div className={styles.answerText} dangerouslySetInnerHTML={{ __html: sanitizedAnswerHtml }}></div>
            </Stack.Item>

            {!!parsedAnswer.citations.length && (
                <Stack.Item>
                    <Stack horizontal wrap tokens={{ childrenGap: 5 }}>
                        <span className={styles.citationLearnMore}>Citations:</span>
                        {parsedAnswer.citations.map((x, i) => {
                            // const arr = x.split(",")
                            
                            return (
                                <a key={i} className={styles.citation} title={x} onClick={() => onCitationClicked(x)}>
                                    {`${++i}. ${x}`}
                                </a>
                                // <DefaultButton text={arr[0]} key={i} menuProps={menuProps} onMenuClick={() => { selectedCitation.current = arr }} />
                            );
                        })}
                    </Stack>
                </Stack.Item>
            )}

            {!!parsedAnswer.followupQuestions.length && showFollowupQuestions && onFollowupQuestionClicked && (
                <Stack.Item>
                    <Stack horizontal wrap className={`${!!parsedAnswer.citations.length ? styles.followupQuestionsList : ""}`} tokens={{ childrenGap: 6 }}>
                        <span className={styles.followupQuestionLearnMore}>Follow-up questions:</span>
                        {parsedAnswer.followupQuestions.map((x, i) => {
                            return (
                                <a key={i} className={styles.followupQuestion} title={x} onClick={() => onFollowupQuestionClicked(x)}>
                                    {`${x}`}
                                </a>
                            );
                        })}
                    </Stack>
                </Stack.Item>
            )}
        </Stack>
    );
};
