 🚀✨ GITHUB EXPLORER 🚀✨
 
This project is a Node.js application that performs the following functions:

1. Fetches and Compiles GitHub Repository Content:
    * Crawls all files within a specified GitHub repository.
    * Fetches the content of each file.
    * Compiles and organizes the contents into a single PDF document.
2. Processes the PDF with LangChain and Unstructured:
    * Utilizes the UnstructuredLoader from LangChain to parse and extract information from the PDF.
    * Employs the RecursiveCharacterTextSplitter to split the extracted content into manageable chunks for processing.
3. Generates Embeddings and Builds a Vector Store:
    * Uses OpenAIEmbeddings to convert text chunks into vector embeddings.
    * Stores these embeddings in a MemoryVectorStore for efficient similarity searches.
4. Implements a Retrieval-Augmented Generation (RAG) System:
    * Allows users to input questions related to the repository content.
    * Performs similarity searches on the vector store to find relevant context.
    * Utilizes OpenAI's GPT-4 model to generate answers based on the retrieved context.
5. Interactive Q&A Interface:
    * Provides a command-line interface where users can ask questions.
    * Displays AI-generated answers that are concise and based solely on the provided context.
    * Ensures the assistant responds with "I do not know" if the answer cannot be derived from the context.
6. Optional PDF Viewer:
    * Includes an Express server to serve the generated PDF for manual inspection or debugging purposes.
    * Accessible via http://localhost:3000/view-pdf.
