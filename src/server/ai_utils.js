import axios from "axios";
import "dotenv/config";

export function getPrompt(thread = []) {
  return function (userPrompt, options = {}) {
    const url = "https://api.openai.com/v1/chat/completions";
    const promptMessage = {
      role: "user",
      content: userPrompt,
    };

    console.log(thread);

    return axios({
      method: "post",
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      data: {
        model: "gpt-4o-mini",
        // max_tokens: 500,
        temperature: 0,
        ...options,
        messages: [...thread, promptMessage],
      },
    }).then((res) => {
      const choice = res.data.choices[0];
      if (choice.finish_reason === "stop") {
        const thread_length = thread.reduce((a, c) => a + c.length, 0);
        if (thread_length > 3000) {
          thread.splice(1, 1);
        }
        thread.push(promptMessage);
        thread.push(choice.message);
        return choice.message;
      }
      console.log(choice.finish_reason);
      throw new Error("No response from AI");
    });
  };
}
