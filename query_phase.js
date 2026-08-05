import readlineSync from 'readline-sync';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import * as dotenv from 'dotenv';
dotenv.config();
import { Pinecone } from '@pinecone-database/pinecone';

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-embedding-001',
});

// Then search the enbedding in Vector DB
const pinecone = new Pinecone();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-3.1-pro-preview',
    temperature: 0.3,
});

export const chatting = async (question) => {
    // Create Enbedding of Question
    const queryVector = await embeddings.embedQuery(question);
    // console.log(queryVector)

    const searchResults = await pineconeIndex.query({
        topK: 10,
        vector: queryVector,
        includeMetadata: true,
    });

    const context = searchResults.matches
        .map(match => match.metadata.text)
        .join("\n\n---\n\n");

    // All relevent data give it to llm

    // Step 4: Create a prompt template
    const promptTemplate = PromptTemplate.fromTemplate(`
        You are a helpful assistant answering questions based on the provided documentation.

        Context from the documentation:
        {context}

        Question: {question}

        Instructions:
        - Answer the question using ONLY the information from the context above
        - If the answer is not in the context, say "I don't have enough information to answer that question."
        - Be concise and clear

Answer:
        `);

    // Step 5: Create a chain (prompt → model → parser)
    const chain = RunnableSequence.from([
        promptTemplate,
        model,
        new StringOutputParser(),
    ]);

    //LLM will give answer
    // Step 6: Invoke the chain and get the answer
    const answer = await chain.invoke({
        context: context,
        question: question,
    });

    return {
        answer: answer,
        matches: searchResults.matches
    };
}

async function main() {
    const userProblem = readlineSync.question("Ask me anything--> ");
    const result = await chatting(userProblem);
    console.log(result.answer);
    main();
}

if (process.argv[1] && (process.argv[1].endsWith('query_phase.js') || process.argv[1].endsWith('query_phase'))) {
    main();
}