export class DataManager {
  constructor(hasFirefoxAPI) {
    this.hasFirefoxAPI = hasFirefoxAPI;
    this.callbacks = {
      onDataImported: null,
      onError: null
    };
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async exportData(topicsData, currentTopicIndex) {
    try {
      // Get complete data from storage
      let completeData;
      if (this.hasFirefoxAPI) {
        const result = await browser.storage.local.get(['topicsData', 'currentTopicIndex', 'categorySets']);
        completeData = {
          topicsData: result.topicsData || [],
          currentTopicIndex: result.currentTopicIndex || -1,
          categorySets: result.categorySets || {
            standard: {
              name: "Standard Set",
              categories: ["Files", "Notes", "Links"]
            }
          }
        };
      } else {
        completeData = {
          topicsData: JSON.parse(localStorage.getItem('topicsData') || '[]'),
          currentTopicIndex: parseInt(localStorage.getItem('currentTopicIndex') || '-1'),
          categorySets: JSON.parse(localStorage.getItem('categorySets') || '{}')
        };
      }

      // Create export data with complete state
      const exportData = {
        topicsData: completeData.topicsData.map(topic => ({
          name: topic.name,
          tabs: topic.tabs || [],
          categories: topic.categories?.map(category => ({
            name: category.name,
            bookmarks: category.bookmarks || []
          })) || []
        })),
        currentTopicIndex: completeData.currentTopicIndex,
        categorySets: completeData.categorySets
      };

      // Create and trigger download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `topics_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      return true;
    } catch (error) {
      console.error('Error saving data:', error);
      this.callbacks.onError?.('Failed to save data');
      return false;
    }
  }

  setupImportInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    return input;
  }

  async importData() {
    const input = this.setupImportInput();
    
    input.addEventListener('change', async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const data = JSON.parse(event.target.result);
            
            // Validate data structure
            if (!Array.isArray(data.topicsData)) {
              throw new Error('Invalid data format');
            }

            // Validate each topic has the required structure
            const validatedData = {
              topicsData: data.topicsData.map(topic => ({
                name: topic.name || 'Unnamed Topic',
                tabs: Array.isArray(topic.tabs) ? topic.tabs : [],
                categories: Array.isArray(topic.categories) ? topic.categories.map(category => ({
                  name: category.name || 'Unnamed Category',
                  bookmarks: Array.isArray(category.bookmarks) ? category.bookmarks : []
                })) : []
              })),
              currentTopicIndex: typeof data.currentTopicIndex === 'number' ? 
                data.currentTopicIndex : -1,
              categorySets: data.categorySets || {
                standard: {
                  name: "Standard Set",
                  categories: ["Files", "Notes", "Links"]
                }
              }
            };

            // Save category sets separately
            if (this.hasFirefoxAPI) {
              await browser.storage.local.set({ 
                categorySets: validatedData.categorySets 
              });
            } else {
              localStorage.setItem('categorySets', 
                JSON.stringify(validatedData.categorySets)
              );
            }

            // Notify callback with validated data
            await this.callbacks.onDataImported?.(validatedData);
          } catch (error) {
            console.error('Error parsing data:', error);
            this.callbacks.onError?.('Failed to load data: Invalid file format');
          }
        };
        reader.readAsText(file);
      } catch (error) {
        console.error('Error loading file:', error);
        this.callbacks.onError?.('Failed to load file');
      }
    });

    input.click();
  }

  setupEventListeners(elements, topicsData, currentTopicIndex) {
    const { saveDataBtn, loadDataBtn } = elements;

    if (saveDataBtn) {
      saveDataBtn.addEventListener('click', () => this.exportData(topicsData, currentTopicIndex));
    }

    if (loadDataBtn) {
      loadDataBtn.addEventListener('click', () => this.importData());
    }
  }
}