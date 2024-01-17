import { useRef, useState, useEffect } from "react";
import { Checkbox, Panel, DefaultButton, TextField, SpinButton, Dropdown, IDropdownOption } from "@fluentui/react";
import readNDJSONStream from "ndjson-readablestream";

import styles from "./Chat.module.css";

import { chatApi, update, RetrievalMode, Approaches, AskResponse, ChatRequest, ChatTurn } from "../../api";
import { Answer, AnswerError, AnswerLoading } from "../../components/Answer";
import { QuestionInput } from "../../components/QuestionInput";
import { ExampleList } from "../../components/Example";
import { UserChatMessage } from "../../components/UserChatMessage";
import { AnalysisPanel, AnalysisPanelTabs } from "../../components/AnalysisPanel";
import { SettingsButton } from "../../components/SettingsButton";
import { ClearChatButton } from "../../components/ClearChatButton";
import { Any } from "@react-spring/web";
import { mergeStyleSets, FocusTrapZone, Layer, Overlay, Popup } from '@fluentui/react';
import { useBoolean } from '@fluentui/react-hooks';


const popupStyles = mergeStyleSets({
    root: {
        background: 'rgba(0, 0, 0, 0.3)',
        bottom: '0',
        left: '0',
        position: 'fixed',
        right: '0',
        top: '0',
    },
    content: {
        background: 'white',
        left: '50%',
        maxWidth: '400px',
        padding: '20px',
        position: 'absolute',
        top: '50%',
        transform: 'translate(-50%, -50%)',
    },
});

const Chat = () => {
    const [isPopupVisible, { setTrue: showPopup, setFalse: hidePopup }] = useBoolean(false);
    const [comment, setComment] = useState<string>("");
    const likeVal = useRef<{ val: number, index: number }>({ val: 0, index: 0 });
    const [commentError, setCommentError] = useState<string>("");


    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
    const [promptTemplate, setPromptTemplate] = useState<string>("");
    const [retrieveCount, setRetrieveCount] = useState<number>(3);
    const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>(RetrievalMode.Text);
    const [useSemanticRanker, setUseSemanticRanker] = useState<boolean>(true);
    const [shouldStream, setShouldStream] = useState<boolean>(true);
    const [useSemanticCaptions, setUseSemanticCaptions] = useState<boolean>(false);
    const [excludeCategory, setExcludeCategory] = useState<string>("");
    const [useSuggestFollowupQuestions, setUseSuggestFollowupQuestions] = useState<boolean>(false);

    const lastQuestionRef = useRef<string>("");
    const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<unknown>();

    const [activeCitation, setActiveCitation] = useState<string>();
    const [activeAnalysisPanelTab, setActiveAnalysisPanelTab] = useState<AnalysisPanelTabs | undefined>(undefined);

    const [selectedAnswer, setSelectedAnswer] = useState<number>(0);
    const [answers, setAnswers] = useState<[user: string, response: AskResponse][]>([]);

    useEffect(() => {
        // localStorage.setItem("username", "localhost")
        fetch("/.auth/me")
            .then(function (response) {
                return response.json().then((body: any) => {
                    try {
                        let username = body[0]["user_id"];
                        localStorage.setItem("username", username)
                    } catch (error) {
                        console.log("error:", error)
                    }
                });
            })
    }, [])

    const onLikeDislike = async (val: number, index: number) => {
        likeVal.current["val"] = val;
        likeVal.current["index"] = index;
        if (val == -1) {
            showPopup()
        } else {
            setAnswers((ans: [user: string, response: AskResponse][]) => {
                let copyAns: [user: string, response: AskResponse][] = JSON.parse(JSON.stringify(ans));
                copyAns[index][1].isLike = val
                return copyAns;
            })
            await update({ isLike: val, id: answers[index][1]["id"], comment: "" })
        }
    }
    const makeApiRequest = async (question: string) => {
        lastQuestionRef.current = question;

        error && setError(undefined);
        setIsLoading(true);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);

        try {
            const history: ChatTurn[] = answers.map(a => ({ user: a[0], bot: a[1].answer }));
            const request: ChatRequest = {
                history: [...history, { user: question, bot: undefined }],
                approach: Approaches.ReadRetrieveRead,
                shouldStream: shouldStream,
                overrides: {
                    promptTemplate: promptTemplate.length === 0 ? undefined : promptTemplate,
                    excludeCategory: excludeCategory.length === 0 ? undefined : excludeCategory,
                    top: retrieveCount,
                    retrievalMode: retrievalMode,
                    semanticRanker: useSemanticRanker,
                    semanticCaptions: useSemanticCaptions,
                    suggestFollowupQuestions: useSuggestFollowupQuestions,
                },
                username: localStorage.getItem("username")
            };

            const response = await chatApi(request);
            if (!response.body) {
                throw Error("No response body");
            }
            if (shouldStream) {
                let answer: string = '';
                let askResponse: AskResponse = {} as AskResponse;
                for await (const event of readNDJSONStream(response.body)) {
                    console.log("event:", event);
                    if (event["data_points"]) {
                        askResponse = event;
                    } else if (event["choices"] && event["choices"][0]["delta"]) {
                        answer += event["choices"][0]["delta"]["content"] || "";
                        let latestResponse: AskResponse = { ...askResponse, answer: answer };
                        if (event["choices"][0]["finish_reason"] === "stop") {
                            latestResponse["id"] = event["choices"][0]["inserted_id"];
                            latestResponse["isLike"] = 0
                        }
                        setIsLoading(false);
                        setAnswers([...answers, [question, latestResponse]]);
                    }
                }
            } else {
                const parsedResponse: AskResponse = await response.json();
                if (response.status > 299 || !response.ok) {
                    throw Error(parsedResponse.error || "Unknown error");
                }
                setAnswers([...answers, [question, parsedResponse]]);
            }
        } catch (e) {
            console.log("error:", e)
            setError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => {
        lastQuestionRef.current = "";
        error && setError(undefined);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);
        setAnswers([]);
    };

    useEffect(() => chatMessageStreamEnd.current?.scrollIntoView({ behavior: "smooth" }), [isLoading]);

    const onPromptTemplateChange = (_ev?: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
        setPromptTemplate(newValue || "");
    };

    const onRetrieveCountChange = (_ev?: React.SyntheticEvent<HTMLElement, Event>, newValue?: string) => {
        setRetrieveCount(parseInt(newValue || "3"));
    };

    const onRetrievalModeChange = (_ev: React.FormEvent<HTMLDivElement>, option?: IDropdownOption<RetrievalMode> | undefined, index?: number | undefined) => {
        setRetrievalMode(option?.data || RetrievalMode.Hybrid);
    };

    const onUseSemanticRankerChange = (_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        setUseSemanticRanker(!!checked);
    };

    const onUseSemanticCaptionsChange = (_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        setUseSemanticCaptions(!!checked);
    };

    const onShouldStreamChange = (_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        setShouldStream(!!checked);
    };

    const onExcludeCategoryChanged = (_ev?: React.FormEvent, newValue?: string) => {
        setExcludeCategory(newValue || "");
    };

    const onUseSuggestFollowupQuestionsChange = (_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        setUseSuggestFollowupQuestions(!!checked);
    };

    const onExampleClicked = (example: string) => {
        makeApiRequest(example);
    };

    const onShowCitation = (citation: string, index: number) => {
        if (activeCitation === citation && activeAnalysisPanelTab === AnalysisPanelTabs.CitationTab && selectedAnswer === index) {
            setActiveAnalysisPanelTab(undefined);
        } else {
            const url = `${import.meta.env.VITE_APP_BLOB_URL}${citation}${import.meta.env.VITE_APP_SAS_TOKEN}`;
            window.open(url, "_blank")
            // setActiveCitation(url);
            // setActiveAnalysisPanelTab(AnalysisPanelTabs.CitationTab);
        }

        setSelectedAnswer(index);
    };

    const onToggleTab = (tab: AnalysisPanelTabs, index: number) => {
        if (activeAnalysisPanelTab === tab && selectedAnswer === index) {
            setActiveAnalysisPanelTab(undefined);
        } else {
            setActiveAnalysisPanelTab(tab);
        }

        setSelectedAnswer(index);
    };

    const saveComment = async () => {
        console.log("comment:", comment)
        if (comment) {
            hidePopup()
            const val = likeVal.current["val"];
            const index = likeVal.current["index"];
            setAnswers((ans: [user: string, response: AskResponse][]) => {
                let copyAns: [user: string, response: AskResponse][] = JSON.parse(JSON.stringify(ans));
                copyAns[index][1].isLike = val
                return copyAns;
            })
            await update({ isLike: val, id: answers[index][1]["id"], comment: comment })
            setComment("")
        } else {
            // commentError.current = "Comment is required"
            setCommentError("Comment is required")
            console.log("commentError:", commentError)
        }
    }

    return (
        <div className={styles.container}>
            {isPopupVisible && (
                <Layer>
                    <Popup
                        className={popupStyles.root}
                        role="dialog"
                        aria-modal="true"
                        onDismiss={hidePopup}
                    >
                        <Overlay onClick={hidePopup} />
                        <FocusTrapZone>
                            <div className={popupStyles.content}>
                                <h2 className={styles.commentHeader}>Comment</h2>
                                <div className={styles.commentForm}>
                                    <TextField label="" multiline rows={5} cols={150} value={comment} onChange={(e: any) => {
                                        setComment(e.target.value)
                                        if (e.target.value) {
                                            // commentError.current = ""
                                            setCommentError("")
                                        } else {
                                            // commentError.current = "Comment is required"
                                            setCommentError("Comment is required")
                                        }

                                    }} errorMessage={commentError} />
                                </div>
                                <div>
                                    <DefaultButton onClick={saveComment} primary>Submit</DefaultButton>
                                    <DefaultButton onClick={() => { setComment(""); hidePopup() }} className={styles.closePopup}>Close </DefaultButton>
                                </div>
                            </div>
                        </FocusTrapZone>
                    </Popup>
                </Layer>
            )}
            <div className={styles.disclaimerWrapper}>
                
                <div className={styles.commandsContainer}>
                    <ClearChatButton className={styles.commandButton} onClick={clearChat} disabled={!lastQuestionRef.current || isLoading} />
                    {/* <SettingsButton className={styles.commandButton} onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)} /> */}
                </div>
            </div>
            <div className={styles.chatRoot}>
                <div className={styles.chatContainer}>
                    {!lastQuestionRef.current ? (
                        <div className={styles.chatEmptyState}>
                            {/* <SparkleFilled fontSize={"120px"} primaryFill={"rgba(115, 118, 225, 1)"} aria-hidden="true" aria-label="Chat logo" /> */}
                            <h1 className={styles.chatEmptyStateTitle}>AICC GenAI</h1>
                            <p>
                                <div className={styles.powered}>Powered by</div>
                              <img src="aisal.png" alt="logo" style={{ width: "100px" }} />
                            </p>
                            {/* <ExampleList onExampleClicked={onExampleClicked} />+ */}
                        </div>
                    ) : (
                        <div className={styles.chatMessageStream}>
                            {answers.map((answer, index) => (
                                <div key={index}>
                                    <UserChatMessage message={answer[0]} />
                                    <div className={styles.chatMessageGpt}>
                                        <Answer
                                            key={index}
                                            answer={answer[1]}
                                            isSelected={selectedAnswer === index && activeAnalysisPanelTab !== undefined}
                                            onCitationClicked={c => onShowCitation(c, index)}
                                            onThoughtProcessClicked={() => onToggleTab(AnalysisPanelTabs.ThoughtProcessTab, index)}
                                            onSupportingContentClicked={() => onToggleTab(AnalysisPanelTabs.SupportingContentTab, index)}
                                            onFollowupQuestionClicked={q => makeApiRequest(q)}
                                            onLikeDislikeClicked={(val) => {
                                                onLikeDislike(val, index)
                                            }}
                                            showFollowupQuestions={useSuggestFollowupQuestions && answers.length - 1 === index}
                                        />
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerLoading />
                                    </div>
                                </>
                            )}
                            {/* {error ? (
                                <>
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerError error={error.toString()} onRetry={() => makeApiRequest(lastQuestionRef.current)} />
                                    </div>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                </>
                            ) : null} */}
                            <div ref={chatMessageStreamEnd} />
                        </div>
                    )}

                    <div className={styles.chatInput} style={activeAnalysisPanelTab ? { width: "50%" } : {}}>
                        <QuestionInput
                            clearOnSend
                            placeholder="Type a new question (e.g. What is AICC?)"
                            disabled={isLoading}
                            onSend={question => makeApiRequest(question)}
                        />
                    </div>
                </div>

                {answers.length > 0 && activeAnalysisPanelTab && (
                    <AnalysisPanel
                        className={styles.chatAnalysisPanel}
                        activeCitation={activeCitation}
                        onActiveTabChanged={x => onToggleTab(x, selectedAnswer)}
                        citationHeight="810px"
                        answer={answers[selectedAnswer][1]}
                        activeTab={activeAnalysisPanelTab}
                    />
                )}

                <Panel
                    headerText="Configure answer generation"
                    isOpen={isConfigPanelOpen}
                    isBlocking={false}
                    onDismiss={() => setIsConfigPanelOpen(false)}
                    closeButtonAriaLabel="Close"
                    onRenderFooterContent={() => <DefaultButton onClick={() => setIsConfigPanelOpen(false)}>Close</DefaultButton>}
                    isFooterAtBottom={true}
                >
                    <TextField
                        className={styles.chatSettingsSeparator}
                        defaultValue={promptTemplate}
                        label="Override prompt template"
                        multiline
                        autoAdjustHeight
                        onChange={onPromptTemplateChange}
                    />

                    <SpinButton
                        className={styles.chatSettingsSeparator}
                        label="Retrieve this many search results:"
                        min={1}
                        max={50}
                        defaultValue={retrieveCount.toString()}
                        onChange={onRetrieveCountChange}
                    />
                    <TextField className={styles.chatSettingsSeparator} label="Exclude category" onChange={onExcludeCategoryChanged} />
                    <Checkbox
                        className={styles.chatSettingsSeparator}
                        checked={useSemanticRanker}
                        label="Use semantic ranker for retrieval"
                        onChange={onUseSemanticRankerChange}
                    />
                    <Checkbox
                        className={styles.chatSettingsSeparator}
                        checked={useSemanticCaptions}
                        label="Use query-contextual summaries instead of whole documents"
                        onChange={onUseSemanticCaptionsChange}
                        disabled={!useSemanticRanker}
                    />
                    <Checkbox
                        className={styles.chatSettingsSeparator}
                        checked={useSuggestFollowupQuestions}
                        label="Suggest follow-up questions"
                        onChange={onUseSuggestFollowupQuestionsChange}
                    />
                    <Dropdown
                        className={styles.chatSettingsSeparator}
                        label="Retrieval mode"
                        options={[
                            { key: "hybrid", text: "Vectors + Text (Hybrid)", selected: retrievalMode == RetrievalMode.Hybrid, data: RetrievalMode.Hybrid },
                            { key: "vectors", text: "Vectors", selected: retrievalMode == RetrievalMode.Vectors, data: RetrievalMode.Vectors },
                            { key: "text", text: "Text", selected: retrievalMode == RetrievalMode.Text, data: RetrievalMode.Text }
                        ]}
                        required
                        onChange={onRetrievalModeChange}
                    />
                    <Checkbox
                        className={styles.chatSettingsSeparator}
                        checked={shouldStream}
                        label="Stream chat completion responses"
                        onChange={onShouldStreamChange}
                    />
                </Panel>
            </div>
        </div>
    );
};

export default Chat;
