import { useConversationsIndexedDB } from './useConversationsIndexedDB';
import { useSettings } from './useSettings';
import { useGenerate } from './useGenerate';
import { useState, useCallback } from 'react';
import { useSendMessage } from './useSendMessage';
import { useFineTuningStore } from '../../store/fineTuningStore';

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
  const { streamingContent, streamingContentRef, abortController, stopGeneration, sendMessage: originalSendMessage } = sendSlice;

  const fineTuningStore = useFineTuningStore();
  const {
    fineTunings, selectedFineTuningId, selectFineTuning,
    createFineTuning, updateFineTuning, deleteFineTuning,
    createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry,
  } = fineTuningStore;

  // Create a wrapper for sendMessage that includes fine-tuning context
  const sendMessage = useCallback((content: string, images: string[], convId: string) => {
    console.log('=== STORE SENDMESSAGE WRAPPER ===');
    console.log('selectedFineTuningId:', selectedFineTuningId);
    console.log('fineTunings length:', fineTunings?.length);
    console.log('=== END WRAPPER DEBUG ===');
    return originalSendMessage(content, images, convId, selectedFineTuningId, fineTunings);
  }, [originalSendMessage, selectedFineTuningId, fineTunings]);

  return {
    // state
    conversations, activeConvId, activeConversation,
    settings, isGenerating, streamingContent, streamingContentRef, allProviderModels,
    storageQuotaExceeded, isLoading, fineTunings, selectedFineTuningId,
    // conversation actions
    setActiveConvId, newConversation, deleteConversation, updateConversationTitle,
    setConversations, setConversationModel, deleteLastMessage, editMessage, deleteMessagesFrom,
    updateMessageVersions, setConversationMode, setConversationAttachments,
    setBuildMode, setConversationDevEnvSession, addMessage,
    // settings actions
    updateSettings, updateModelSettings, updateProvider,
    addIntegratedProvider, addProvider, deleteProvider,
    upsertApiFormat, deleteApiFormat,
    // messaging
    sendMessage, stopGeneration,
    // generation
    generateImage, generateConversationTitle, generateFollowUps, transcribeAudio,
    // fine-tuning actions
    selectFineTuning, createFineTuning, updateFineTuning, deleteFineTuning,
    createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry,
    // utils
    getProviderAndModel, resolveStorageQuota,
  };
}
