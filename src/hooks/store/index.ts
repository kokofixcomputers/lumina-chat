import { useConversationsIndexedDB } from './useConversationsIndexedDB';
import { useSettings } from './useSettings';
import { useGenerate } from './useGenerate';
import { useSendMessage } from './useSendMessage';

export function useAppStore() {
  const settingsSlice = useSettings();
  const {
    settings, setSettings,
    updateSettings, updateModelSettings, updateProvider,
    addIntegratedProvider, addProvider, deleteProvider,
    upsertApiFormat, deleteApiFormat,
    getProviderAndModel, allProviderModels,
  } = settingsSlice;

  const convSlice = useConversationsIndexedDB(settings.defaultProviderModelId);
  const {
    conversations, setConversations, conversationsRef,
    activeConvId, setActiveConvId, activeConversation,
    storageQuotaExceeded, resolveStorageQuota, isLoading,
    newConversation, deleteConversation, updateConversationTitle, addMessage,
    setConversationModel, deleteLastMessage, editMessage, deleteMessagesFrom,
    updateMessageVersions, setConversationMode, setConversationAttachments,
    setBuildMode, setConversationDevEnvSession,
  } = convSlice;

  const generateSlice = useGenerate({
    conversations, settings, getProviderAndModel, addMessage,
    updateConversationTitle, setConversations,
  });
  const {
    isGenerating, setIsGenerating,
    generateConversationTitle, generateFollowUps, generateImage, transcribeAudio,
  } = generateSlice;

  const sendSlice = useSendMessage({
    conversations, conversationsRef, settings, getProviderAndModel,
    addMessage, setConversations, updateProvider,
    generateConversationTitle, generateFollowUps, setIsGenerating,
  });
  const { streamingContent, streamingContentRef, abortController, stopGeneration, sendMessage } = sendSlice;

  return {
    // state
    conversations, activeConvId, activeConversation,
    settings, isGenerating, streamingContent, streamingContentRef, allProviderModels,
    storageQuotaExceeded, isLoading,
    // conversation actions
    setActiveConvId, newConversation, deleteConversation, updateConversationTitle,
    setConversations, setConversationModel, deleteLastMessage, editMessage, deleteMessagesFrom,
    updateMessageVersions, setConversationMode, setConversationAttachments,
    setBuildMode, setConversationDevEnvSession,
    // settings actions
    updateSettings, updateModelSettings, updateProvider,
    addIntegratedProvider, addProvider, deleteProvider,
    upsertApiFormat, deleteApiFormat,
    // messaging
    sendMessage, stopGeneration,
    // generation
    generateImage, generateConversationTitle, generateFollowUps, transcribeAudio,
    // utils
    getProviderAndModel, resolveStorageQuota,
  };
}
