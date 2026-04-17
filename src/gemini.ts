import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ArgumentEvaluation {
  score: number;
  feedback: string;
}

export async function evaluateArgument(claim: string, reason: string, evidence: string): Promise<ArgumentEvaluation> {
  const prompt = `너는 논리학 전문가이자 초등학생 논술 교사야. 
학생이 쓴 [주장], [이유], [근거]의 논리적 구조를 평가해줘.

학생의 글:
주장: ${claim}
이유: ${reason}
근거: ${evidence}

평가 기준:
1. 근거가 이유를 제대로 뒷받침하는가?
2. 근거가 객관적인 사실인가? (사실이 아닌 주관적 견해라면 감점)
3. 논리적 비약이 없는가?

결과는 0~100점 사이의 점수와, 학생의 발전을 위한 따뜻하지만 날카로운 한 줄 조언(한국어)으로 응답해줘.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a logic expert and elementary school writing teacher. Always respond in JSON format with 'score' (number) and 'feedback' (string).",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER, description: "Score from 0 to 100" },
            feedback: { type: Type.STRING, description: "One-line sharp advice in Korean" }
          },
          required: ["score", "feedback"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      score: result.score ?? 0,
      feedback: result.feedback ?? "평가에 실패했습니다. 다시 시도해 주세요."
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      score: 0,
      feedback: "AI 분석 중 오류가 발생했습니다."
    };
  }
}

export async function evaluateRebuttal(originalArgument: string, rebuttal: string): Promise<ArgumentEvaluation> {
  const prompt = `너는 논리학 전문가이자 토론 심판이야. 
학생이 상대방의 논증에 대해 제기한 [반박/질문]이 얼마나 논리적이고 효과적인지 평가해줘.

상대방의 논증: ${originalArgument}
학생의 반박: ${rebuttal}

평가 기준:
1. 상대방의 논증에서 핵심적인 허점을 찔렀는가?
2. 질문이 구체적이고 논리적인가?
3. 반박이 감정적이지 않고 근거를 바탕으로 하는가?

결과는 0~100점 사이의 점수와, 학생을 위한 따뜻하지만 날카로운 한 줄 조언(한국어)으로 응답해줘.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a logic expert and debate judge. Always respond in JSON format with 'score' (number) and 'feedback' (string).",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER, description: "Score from 0 to 100" },
            feedback: { type: Type.STRING, description: "One-line sharp advice in Korean" }
          },
          required: ["score", "feedback"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      score: result.score ?? 0,
      feedback: result.feedback ?? "분석에 실패했습니다."
    };
  } catch (error) {
    console.error("Gemini Rebuttal Error:", error);
    return { score: 0, feedback: "AI 분석 중 오류가 발생했습니다." };
  }
}
