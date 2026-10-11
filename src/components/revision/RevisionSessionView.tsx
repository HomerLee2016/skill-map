import AnswerQuestion from '../AnswerQuestion';
import IncorrectReviewScreen from '../IncorrectReviewScreen';
import QuestionTracker from '../QuestionTracker';
import type { useRevisionSession } from '../../hooks/useRevisionSession';

type Session = ReturnType<typeof useRevisionSession>;

export function RevisionSessionView({ session }: { session: Session }) {
  const {
    revisionQuestions, answers, correctMap, currentIdx, finished, showIncorrectReview, score, totalQuestions,
    isLastQuestion, autoAdvanceOnCorrect, setAutoAdvanceOnCorrect, audioTrackEnabled, setAudioTrackEnabled,
  } = session;

  if (showIncorrectReview) {
    return (
      <IncorrectReviewScreen
        questions={revisionQuestions}
        answers={answers}
        correctMap={correctMap}
        title="Revision review"
        subtitle="Review the questions you answered incorrectly."
        onFinish={session.finishIncorrectReview}
      />
    );
  }

  if (revisionQuestions.length === 0) {
    return (
      <div className="tests-score">
        <p>No questions are due for review right now. Come back later.</p>
      </div>
    );
  }

  return (
    <div className="test-question-container">
      <QuestionTracker
        totalQuestions={revisionQuestions.length}
        answers={answers}
        correctMap={correctMap}
        currentIndex={currentIdx}
        limit={15}
        disabled
        onSelectQuestion={session.jumpToQuestion}
        questionNumbers={revisionQuestions.map((question) => question.displayQuestionNumber ?? question.question_number)}
        slidingWindow
      />
      {revisionQuestions.slice(currentIdx, currentIdx + 1).map((q) => (
        <AnswerQuestion
          key={`${q.question_number}-${q.question}`}
          q={q}
          answers={answers}
          correctMap={correctMap}
          handleAnswerSelect={session.handleAnswerSelect}
          onNextQuestion={session.handleNextQuestionOrFinish}
          showNextButton={!!answers[q.question_number] && !finished && (!isLastQuestion || !autoAdvanceOnCorrect)}
          autoAdvanceOnCorrect={autoAdvanceOnCorrect}
          onAutoAdvanceChange={setAutoAdvanceOnCorrect}
          audioTrackEnabled={audioTrackEnabled}
          onAudioTrackEnabledChange={setAudioTrackEnabled}
          onAudioPlaybackStart={session.handleAudioPlaybackStart}
          onAudioPlaybackEnd={session.handleAudioPlaybackEnd}
          onAudioPlaybackError={session.handleAudioPlaybackError}
        />
      ))}
      {finished ? (
        <div className="tests-score">
          <p>Finished! Score: {score} / {totalQuestions}</p>
          <button type="button" className="toolbar-btn" onClick={session.startIncorrectReview}>
            Review Incorrect Answers
          </button>
        </div>
      ) : null}
    </div>
  );
}
